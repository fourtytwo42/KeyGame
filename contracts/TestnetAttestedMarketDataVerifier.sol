// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IMarketDataVerifier } from "./interfaces/IMarketDataVerifier.sol";

/// @notice Testnet-only verifier for Chainlink reports acquired offchain.
/// @dev The attestor signs normalized report fields and the original signed
/// Chainlink report hash. The signature is bound to this chain, verifier, and
/// calling round. This contract must never appear in a mainnet manifest.
contract TestnetAttestedMarketDataVerifier is IMarketDataVerifier {
    struct AttestedReport {
        bytes32 feedId;
        uint256 price;
        uint64 validFrom;
        uint64 observedAt;
        uint64 expiresAt;
        address round;
        bytes32 sourceReportHash;
        bytes signature;
    }

    bytes32 public constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 public constant REPORT_TYPEHASH = keccak256(
        "MarketReport(bytes32 feedId,uint256 price,uint64 validFrom,uint64 observedAt,uint64 expiresAt,address round,bytes32 sourceReportHash)"
    );
    bytes32 private constant NAME_HASH =
        keccak256("Last Bell Testnet Market Attestation");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1_HALF_N =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    address public immutable attestor;
    address public immutable admin;
    address public authorizer;
    mapping(address => bool) public authorizedCaller;
    bytes32 public immutable domainSeparator;

    error InvalidAttestation();

    constructor(address attestor_, address admin_) {
        if (attestor_ == address(0) || admin_ == address(0)) {
            revert InvalidAttestation();
        }
        attestor = attestor_;
        admin = admin_;
        domainSeparator = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)
            )
        );
    }

    function setAuthorizer(address authorizer_) external {
        if (
            msg.sender != admin || authorizer != address(0) || authorizer_ == address(0)
        ) revert InvalidAttestation();
        authorizer = authorizer_;
    }

    function authorizeCaller(address caller) external {
        if (msg.sender != authorizer || caller == address(0)) {
            revert InvalidAttestation();
        }
        authorizedCaller[caller] = true;
    }

    function verify(bytes calldata encoded)
        external
        view
        returns (
            bytes32 feedId,
            uint256 price,
            uint64 validFrom,
            uint64 observedAt,
            uint64 expiresAt,
            bytes32 sourceReportHash
        )
    {
        if (!authorizedCaller[msg.sender]) {
            revert InvalidAttestation();
        }
        AttestedReport memory report = abi.decode(encoded, (AttestedReport));
        if (
            report.round != msg.sender || report.price == 0
                || report.sourceReportHash == bytes32(0)
        ) revert InvalidAttestation();

        bytes32 structHash = keccak256(
            abi.encode(
                REPORT_TYPEHASH,
                report.feedId,
                report.price,
                report.validFrom,
                report.observedAt,
                report.expiresAt,
                report.round,
                report.sourceReportHash
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        if (_recover(digest, report.signature) != attestor) {
            revert InvalidAttestation();
        }
        return (
            report.feedId,
            report.price,
            report.validFrom,
            report.observedAt,
            report.expiresAt,
            report.sourceReportHash
        );
    }

    function _recover(bytes32 digest, bytes memory signature)
        private
        pure
        returns (address recovered)
    {
        if (signature.length != 65) revert InvalidAttestation();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }
        if (uint256(s) > SECP256K1_HALF_N || (v != 27 && v != 28)) {
            revert InvalidAttestation();
        }
        recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert InvalidAttestation();
    }
}
