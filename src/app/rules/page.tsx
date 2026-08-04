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
      eyebrow="BELL RUSH / HOW TO PLAY"
      title="Four stocks. One bell."
      intro="Pick a stock. Ape to earn Round Points and steal the bell. The #1 stock splits 30%. Hold the bell at zero to win 50%."
    >
      <section>
        <span className="chapterNumber">01</span>
        <div>
          <h2>Pick one of four stocks</h2>
          <p>
            Your first choice is also your first contribution. You are not
            joining a permanent team. The next time you take the bell, you can
            choose a different stock. The timer does not start until this first
            contribution succeeds.
          </p>
        </div>
      </section>
      <section>
        <span className="chapterNumber">02</span>
        <div>
          <h2>Choose an amount and take the bell</h2>
          <p>
            The minimum is {roundConfig.claimPriceUsd} USDG and there is no
            maximum. Your full contribution earns points and takes the bell. The
            pool may swap all or only part of it into the Stock Token you
            picked. Any USDG it cannot spend stays in the round&apos;s reward
            pot. You cannot call again while you already hold the bell.
          </p>
        </div>
      </section>
      <section>
        <span className="chapterNumber">03</span>
        <div>
          <h2>Every play resets the clock</h2>
          <p>
            Your first successful play starts the clock at 5 minutes. Every
            later successful play resets it to 5 minutes. The round still has a
            10-minute hard stop, so a late reset uses whatever time remains
            before that hard stop.
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
          <h2>Example: what a $100 call does</h2>
          <p>
            TSLA is earning 1.50 points per dollar. A $100 call earns 150 Round
            Points and makes you the bell holder. If TSLA finishes as the #1
            stock and your 150 points are 10% of all TSLA points, you receive
            10% of the Winning Stock pool. If nobody takes the bell before zero,
            you also receive the separate 50% Last Bell prize.
          </p>
        </div>
      </section>
      <section>
        <span className="chapterNumber">07</span>
        <div>
          <h2>Rug Zone is first come, first served</h2>
          <p>
            RUG ZONE IS FCFS. Automated wallets may be faster. The last accepted
            call before zero wins the full 50% final-holder prize. A successful
            call resets the clock unless the 10-minute hard stop is closer.
          </p>
        </div>
      </section>
      <section>
        <span className="chapterNumber">08</span>
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
      <section>
        <span className="chapterNumber">09</span>
        <div>
          <h2>Market execution has no protocol price cap</h2>
          <p>
            The game accepts any positive Stock Token output by default. Price
            impact can be extreme when a pool gets thin. Partial fills still
            count, and every unspent USDG remains in the five-asset pot.
            Arbitrage may refill a pool, but it is not guaranteed. Wallets and
            direct integrations can still choose a stricter minimum output.
          </p>
        </div>
      </section>
      <div className="constantTape">
        <span>START 5m</span>
        <span>RESET 5m</span>
        <span>RUG ZONE 10s</span>
        <span>HARD STOP 10m</span>
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
