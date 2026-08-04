// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { TestBase } from "./TestBase.sol";
import { MockUSDG } from "../../contracts/mocks/MockUSDG.sol";
import { MockStockSwapAdapter } from "../../contracts/mocks/MockStockSwapAdapter.sol";
import { RoundManagerV4 } from "../../contracts/RoundManagerV4.sol";

contract RoundManagerV4AdministrationTest is TestBase {
    RoundManagerV4 internal manager;

    function setUp() public {
        MockUSDG payment = new MockUSDG();
        MockStockSwapAdapter adapter = new MockStockSwapAdapter(payment);
        manager = new RoundManagerV4(
            payment, adapter, address(this), address(0xB0B), address(0xCAFE)
        );
    }

    function test_AdminTransferRequiresPendingAdminAcceptance() public {
        address nextAdmin = address(0xA11CE);
        manager.proposeAdmin(nextAdmin);
        assertEq(manager.admin(), address(this), "admin changed before acceptance");
        assertEq(manager.pendingAdmin(), nextAdmin, "pending admin");

        vm.prank(address(0xBAD));
        vm.expectRevert(RoundManagerV4.Unauthorized.selector);
        manager.acceptAdmin();

        vm.prank(nextAdmin);
        manager.acceptAdmin();
        assertEq(manager.admin(), nextAdmin, "accepted admin");
        assertEq(manager.pendingAdmin(), address(0), "pending cleared");

        vm.expectRevert(RoundManagerV4.Unauthorized.selector);
        manager.setKeeper(address(0xD00D));
    }

    function test_AdminCanCancelPendingTransfer() public {
        address nextAdmin = address(0xA11CE);
        manager.proposeAdmin(nextAdmin);
        manager.cancelAdminTransfer();
        assertEq(manager.pendingAdmin(), address(0), "cancelled pending admin");

        vm.prank(nextAdmin);
        vm.expectRevert(RoundManagerV4.Unauthorized.selector);
        manager.acceptAdmin();
    }

    function test_OnlyAdminCanRotateKeeper() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(RoundManagerV4.Unauthorized.selector);
        manager.setKeeper(address(0xD00D));

        manager.setKeeper(address(0xD00D));
        assertEq(manager.keeper(), address(0xD00D), "keeper rotation");
    }

    function test_TreasuryTransferRequiresAcceptanceAndCanBeCancelled() public {
        address nextTreasury = address(0xD00D);
        manager.proposeTreasury(nextTreasury);
        assertEq(manager.treasury(), address(0xCAFE), "treasury changed early");
        assertEq(manager.pendingTreasury(), nextTreasury, "pending treasury");

        vm.prank(address(0xBAD));
        vm.expectRevert(RoundManagerV4.Unauthorized.selector);
        manager.acceptTreasury();

        manager.cancelTreasuryTransfer();
        vm.prank(nextTreasury);
        vm.expectRevert(RoundManagerV4.Unauthorized.selector);
        manager.acceptTreasury();

        manager.proposeTreasury(nextTreasury);
        vm.prank(nextTreasury);
        manager.acceptTreasury();
        assertEq(manager.treasury(), nextTreasury, "accepted treasury");
        assertEq(manager.pendingTreasury(), address(0), "pending cleared");
    }

    function test_TreasuryTransferRejectsZeroAndUnauthorizedProposal() public {
        vm.expectRevert(RoundManagerV4.Unauthorized.selector);
        manager.proposeTreasury(address(0));

        vm.prank(address(0xBAD));
        vm.expectRevert(RoundManagerV4.Unauthorized.selector);
        manager.proposeTreasury(address(0xD00D));
    }
}
