// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IMarketDataVerifier } from "./interfaces/IMarketDataVerifier.sol";
import { IChainlinkReportDecoder } from "./ChainlinkEquityReportDecoder.sol";

interface IVerifierProxy {
    function verify(bytes calldata payload, bytes calldata parameterPayload)
        external
        payable
        returns (bytes memory verifierResponse);
}

/// @notice Production adapter for a Chainlink Data Streams VerifierProxy.
contract ChainlinkMarketDataVerifier is IMarketDataVerifier {
    IVerifierProxy public immutable verifierProxy;
    IChainlinkReportDecoder public immutable decoder;
    address public admin;
    address public authorizer;
    uint256 public verificationFeeWei;
    mapping(address => bool) public authorizedCaller;

    event CallerAuthorizationChanged(address indexed caller, bool authorized);
    event VerificationFeeChanged(uint256 feeWei);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event AuthorizerConfigured(address indexed authorizer);

    error Unauthorized();
    error TransferFailed();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    constructor(
        IVerifierProxy verifierProxy_,
        IChainlinkReportDecoder decoder_,
        address admin_
    ) {
        if (
            address(verifierProxy_) == address(0) || address(decoder_) == address(0)
                || admin_ == address(0)
        ) revert Unauthorized();
        verifierProxy = verifierProxy_;
        decoder = decoder_;
        admin = admin_;
    }

    receive() external payable { }

    function setAuthorizedCaller(address caller, bool authorized) external onlyAdmin {
        if (caller == address(0)) revert Unauthorized();
        authorizedCaller[caller] = authorized;
        emit CallerAuthorizationChanged(caller, authorized);
    }

    function setAuthorizer(address authorizer_) external onlyAdmin {
        if (authorizer != address(0) || authorizer_ == address(0)) {
            revert Unauthorized();
        }
        authorizer = authorizer_;
        emit AuthorizerConfigured(authorizer_);
    }

    function authorizeCaller(address caller) external {
        if (msg.sender != authorizer || caller == address(0)) {
            revert Unauthorized();
        }
        authorizedCaller[caller] = true;
        emit CallerAuthorizationChanged(caller, true);
    }

    function setVerificationFee(uint256 feeWei) external onlyAdmin {
        verificationFeeWei = feeWei;
        emit VerificationFeeChanged(feeWei);
    }

    function transferAdmin(address nextAdmin) external onlyAdmin {
        if (nextAdmin == address(0)) revert Unauthorized();
        emit AdminTransferred(admin, nextAdmin);
        admin = nextAdmin;
    }

    function withdrawNative(address payable recipient, uint256 amount)
        external
        onlyAdmin
    {
        if (recipient == address(0)) revert Unauthorized();
        (bool success,) = recipient.call{ value: amount }("");
        if (!success) revert TransferFailed();
    }

    function verify(bytes calldata report)
        external
        returns (
            bytes32 feedId,
            uint256 price,
            uint64 validFrom,
            uint64 observedAt,
            uint64 expiresAt,
            bytes32 sourceReportHash
        )
    {
        if (!authorizedCaller[msg.sender]) revert Unauthorized();
        bytes memory verified = verifierProxy.verify{ value: verificationFeeWei }(
            report, abi.encode(address(0))
        );
        (feedId, price, validFrom, observedAt, expiresAt) = decoder.decode(verified);
        sourceReportHash = keccak256(report);
    }
}
