type Actor = {
  name: string;
  latencyMeanMs: number;
  latencyJitterMs: number;
  attemptsPerSecond: number;
};

const actors: Actor[] = [
  {
    name: "human-wallet",
    latencyMeanMs: 1_400,
    latencyJitterMs: 900,
    attemptsPerSecond: 0.35,
  },
  {
    name: "automated-wallet",
    latencyMeanMs: 180,
    latencyJitterMs: 90,
    attemptsPerSecond: 4,
  },
];
const rounds = Number(process.env.RUG_SIM_ROUNDS || 100_000);
let seed = 0x4663;
const random = () => {
  seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
  return seed / 2 ** 32;
};

const wins = new Map(actors.map((actor) => [actor.name, 0]));
for (let round = 0; round < rounds; round += 1) {
  let latest: { actor: string; acceptedAt: number } | null = null;
  for (const actor of actors) {
    const attempts = Math.max(1, Math.round(actor.attemptsPerSecond * 10));
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const submittedAt = random() * 10_000;
      const jitter = (random() * 2 - 1) * actor.latencyJitterMs;
      const acceptedAt =
        submittedAt + Math.max(25, actor.latencyMeanMs + jitter);
      if (acceptedAt <= 10_000 && (!latest || acceptedAt > latest.acceptedAt)) {
        latest = { actor: actor.name, acceptedAt };
      }
    }
  }
  if (latest) wins.set(latest.actor, (wins.get(latest.actor) ?? 0) + 1);
}

const evidence = actors.map((actor) => ({
  actor: actor.name,
  wins: wins.get(actor.name) ?? 0,
  winRate: (wins.get(actor.name) ?? 0) / rounds,
  assumptions: actor,
}));
const human = evidence.find((row) => row.actor === "human-wallet")!;
const automated = evidence.find((row) => row.actor === "automated-wallet")!;
process.stdout.write(
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      seed: "0x4663",
      rounds,
      evidence,
      automatedAdvantageRatio:
        human.winRate > 0 ? automated.winRate / human.winRate : null,
      disposition:
        "Product approval is required before audit freeze. This simulation does not claim fair ordering or eliminate sequencer advantage.",
    },
    null,
    2,
  )}\n`,
);
