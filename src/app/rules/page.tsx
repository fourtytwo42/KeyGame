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
      intro="Pick a stock, pay $1 to take the bell, and still hold it when the clock reaches zero."
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
          <h2>Pay $1 to take the bell</h2>
          <p>
            A successful play costs {roundConfig.claimPriceUsd} play USD, puts
            your stock on air, and makes you the new bell holder. The $1 goes
            into the prize pot. You cannot play again while you already hold the
            bell.
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
          <h2>The market changes the score</h2>
          <p>
            We compare your stock&apos;s verified price with its price at the
            start of the round. Up 0.05% or more earns 1.25 points per second. A
            smaller move earns 1 point per second. Down 0.05% or more earns 0.75
            points per second. Your rate locks when your play succeeds and stays
            the same until someone else takes the bell.
          </p>
        </div>
      </section>
      <section>
        <span className="chapterNumber">05</span>
        <div>
          <h2>There are two main winners</h2>
          <p>
            The person holding the bell when the clock reaches zero wins 50% of
            the pot. The stock with the most market-adjusted points wins the 30%
            Closing Print Pool. That 30% is shared among the players who earned
            points for that stock. Another 15% starts the next round, and 5%
            goes to the protocol.
          </p>
        </div>
      </section>
      <section>
        <span className="chapterNumber">06</span>
        <div>
          <h2>Your wallet gives one approval</h2>
          <p>
            Before your first play, your wallet may ask for permission to spend
            up to $100 of play USDG. This is a spending limit, not a $100
            charge. Each successful play still costs only $1. We ask again when
            less than $10 remains. You can lower or cancel the permission in
            your wallet at any time.
          </p>
        </div>
      </section>
      <div className="constantTape">
        <span>START 45s</span>
        <span>ADD 2s</span>
        <span>RUG ZONE 10s</span>
        <span>HARD STOP 180s</span>
        <span>PLAY $1</span>
      </div>
      <div className="disclosureBlock">
        <span className="chapterNumber">ID</span>
        <div>
          <h2>For people checking the code</h2>
          <p>Round contract: {roundAddress}</p>
          <p>Play USDG: {devDollarAddress}</p>
          <p>
            This test version uses fake Stock Tokens for the Producer Pass. The
            game never takes, locks, trades, or awards those tokens.
          </p>
        </div>
      </div>
    </InfoPage>
  );
}
