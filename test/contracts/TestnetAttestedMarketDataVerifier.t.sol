// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {
    TestnetAttestedMarketDataVerifier
} from "../../contracts/TestnetAttestedMarketDataVerifier.sol";
import { LastBellRound } from "../../contracts/LastBellRound.sol";
import { PaymentRouter } from "../../contracts/PaymentRouter.sol";
import { MockStockToken } from "../../contracts/mocks/MockStockToken.sol";
import { MockUSDG } from "../../contracts/mocks/MockUSDG.sol";
import { TestBase } from "./TestBase.sol";

contract TestnetAttestedMarketDataVerifierTest is TestBase {
    uint256 internal constant ATTESTOR_KEY = 0xA771570;
    bytes32 internal constant FEED = keccak256("NVDA/USD");

    MockUSDG internal token;
    PaymentRouter internal router;
    TestnetAttestedMarketDataVerifier internal verifier;
    LastBellRound internal round;

    function setUp() public {
        token = new MockUSDG();
        router = new PaymentRouter(token, address(this));
        verifier =
            new TestnetAttestedMarketDataVerifier(vm.addr(ATTESTOR_KEY), address(this));
        verifier.setAuthorizer(address(this));
        MockStockToken stock = new MockStockToken("MOCK");
        LastBellRound.TickerConfig[4] memory tickers;
        for (uint8 i; i < 4; i++) {
            tickers[i] = LastBellRound.TickerConfig(
                i == 0 ? bytes32("NVDA") : bytes32(uint256(i + 1)),
                address(stock),
                bytes32(uint256(FEED) + i)
            );
        }
        LastBellRound.RoundSettings memory settings = LastBellRound.RoundSettings({
            roundId: 1,
            claimPrice: 1e6,
            startDuration: 45,
            extensionDuration: 2,
            rugDuration: 10,
            hardCapDuration: 180,
            maxReportAge: 3,
            marketThresholdBps: 5,
            greenMultiplierBps: 12_500,
            flatMultiplierBps: 10_000,
            redMultiplierBps: 7_500,
            marketMode: LastBellRound.MarketMode.Verified,
            producerPassRequired: false
        });
        round = new LastBellRound(
            token, router, verifier, address(this), address(0xBEEF), settings, tickers
        );
        verifier.authorizeCaller(address(round));
        router.setRoundAuthorization(address(round), true);
    }

    function test_AcceptsRoundBoundAttestationAndExposesSourceHash() public {
        bytes[4] memory openingReports;
        for (uint8 i; i < 4; i++) {
            openingReports[i] = _report(
                bytes32(uint256(FEED) + i),
                100e8 + i,
                address(round),
                keccak256(abi.encode("opening", i))
            );
        }
        round.start(0, openingReports);
        token.mint(address(0xA11CE), 10e6);
        vm.prank(address(0xA11CE));
        token.approve(address(router), type(uint256).max);

        bytes32 sourceHash = keccak256("genuine-chainlink-report");
        bytes memory claimReport = _report(FEED, 101e8, address(round), sourceHash);
        vm.prank(address(0xA11CE));
        round.claimBell(0, claimReport, type(uint8).max);
        assertEq(round.holderSourceReportHash(), sourceHash, "source hash");
    }

    function test_RejectsSignatureBoundToAnotherRound() public {
        bytes[4] memory openingReports;
        for (uint8 i; i < 4; i++) {
            openingReports[i] = _report(
                bytes32(uint256(FEED) + i),
                100e8 + i,
                address(0xBAD),
                keccak256(abi.encode(i))
            );
        }
        vm.expectRevert(TestnetAttestedMarketDataVerifier.InvalidAttestation.selector);
        round.start(0, openingReports);
    }

    function _report(
        bytes32 feedId,
        uint256 price,
        address reportRound,
        bytes32 sourceHash
    ) internal returns (bytes memory) {
        uint64 now64 = uint64(block.timestamp);
        bytes32 structHash = keccak256(
            abi.encode(
                verifier.REPORT_TYPEHASH(),
                feedId,
                price,
                now64,
                now64,
                now64 + 30,
                reportRound,
                sourceHash
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", verifier.domainSeparator(), structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTOR_KEY, digest);
        return abi.encode(
            TestnetAttestedMarketDataVerifier.AttestedReport({
                feedId: feedId,
                price: price,
                validFrom: now64,
                observedAt: now64,
                expiresAt: now64 + 30,
                round: reportRound,
                sourceReportHash: sourceHash,
                signature: abi.encodePacked(r, s, v)
            })
        );
    }
}
