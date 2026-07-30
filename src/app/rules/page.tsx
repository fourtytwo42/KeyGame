import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { roundConfig } from "@/lib/game/constants";
import { getCurrentDevnetDeployment } from "@/lib/web3/devnet";

export const metadata: Metadata = { title: "Rules" };
export const dynamic = "force-dynamic";

export default function RulesPage() {
  const { roundAddress, devDollarAddress } = getCurrentDevnetDeployment();
  return (
    <InfoPage
      eyebrow="HOW TO PLAY / ROUND 4663"
      title="The rules, in plain English"
      intro="Pick a stock, choose how much to put in, and take the bell. The final caller wins half of every Stock Token in the pot."
    >
      <section>
        <span className="chapterNumber">01</span>
        <div>
          <h2>Pick one of four stocks</h2>
          <p>
            Your first choice is also your first $1 play. You are not joining a
            permanent team. The next time you take the bell, you can choose a
            different stock. The timer does not start until this first $1 play
            succeeds.
          </p>
        </div>
      </section>
      <section>
        <span className="chapterNumber">02</span>
        <div>
          <h2>Choose an amount and take the bell</h2>
          <p>
            The minimum is {roundConfig.claimPriceUsd} USDG and there is no
            maximum. Your USDG buys the Stock Token you picked. Those tokens go
            into this round&apos;s pot, and you become the new bell holder. You
            cannot call again while you already hold the bell.
          </p>
        </div>
      </section>
      <section>
        <span className="chapterNumber">03</span>
        <div>
          <h2>Later plays add two seconds</h2>
          <p>
            Your first successful play starts the clock at 45 seconds. Later
            successful plays usually add {roundConfig.extensionSeconds} seconds
            to it. The round can never last longer than{" "}
            {roundConfig.hardCapSeconds} seconds. When only{" "}
            {roundConfig.rugZoneSeconds} seconds remain, the Rug Zone begins.
            You can still take the bell, but the clock will not gain more time.
          </p>
        </div>
      </section>
      <section>
        <span className="chapterNumber">04</span>
        <div>
          <h2>Recent buys heat up a stock</h2>
          <p>
            Your points start with the USDG amount you put in. Buys from the
            last 30 seconds raise that stock&apos;s multiplier for the next
            caller, up to 2×. Your own buy heats the stock for followers; it
            does not boost itself. DEX price movement does not affect points.
          </p>
        </div>
      </section>
      <section>
        <span className="chapterNumber">05</span>
        <div>
          <h2>There are three ways to earn</h2>
          <p>
            The final caller gets 50% of every token in the pot. The stock with
            the most points wins; its backers split 30% based on their points in
            that stock. Settled points also become lifetime points, which share
            10% of future pots without being spent. Another 5% seeds the next
            round and 5% goes to the protocol.
          </p>
        </div>
      </section>
      <section>
        <span className="chapterNumber">06</span>
        <div>
          <h2>Rug Zone is first come, first served</h2>
          <p>
            RUG ZONE IS FCFS. Automated wallets may be faster. The last accepted
            call before zero wins the full 50% final-holder prize. Calls in Rug
            Zone add no time.
          </p>
        </div>
      </section>
      <section>
        <span className="chapterNumber">07</span>
        <div>
          <h2>Your wallet gives one reusable approval</h2>
          <p>
            Before your first play, your wallet asks for reusable USDG
            permission. It is not a charge. The game asks again only when the
            allowance is below your chosen amount. You can edit or revoke the
            permission in your wallet at any time.
          </p>
        </div>
      </section>
      <div className="constantTape">
        <span>START 45s</span>
        <span>ADD 2s</span>
        <span>RUG ZONE 10s</span>
        <span>HARD STOP 180s</span>
        <span>$1 MIN · NO MAX</span>
      </div>
      <div className="disclosureBlock">
        <span className="chapterNumber">ID</span>
        <div>
          <h2>For people checking the code</h2>
          <p>Round contract: {roundAddress}</p>
          <p>Play USDG: {devDollarAddress}</p>
          <p>
            Devnet and testnet use mock Stock Tokens with no value. A successful
            call swaps mock USDG into the selected mock stock and holds it in
            the round contract for basket settlement.
          </p>
        </div>
      </div>
    </InfoPage>
  );
}
