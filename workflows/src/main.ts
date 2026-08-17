import { task } from "@renderinc/sdk/workflows";
import "./audit.js";

const calculateSquare = task(
  { name: "calculateSquare" },
  function calculateSquare(a: number): number {
    return a * a;
  },
);

const sumSquares = task(
  { name: "sumSquares" },
  async function sumSquares(a: number, b: number): Promise<number> {
    const [result1, result2] = await Promise.all([
      calculateSquare(a),
      calculateSquare(b),
    ]);
    return result1 + result2;
  },
);

task(
  {
    name: "flipCoin",
    retry: {
      maxRetries: 3,
      waitDurationMs: 1000,
      backoffScaling: 1.5,
    },
  },
  function flipCoin(): string {
    if (Math.random() < 0.5) {
      throw new Error("Flipped tails! Retrying.");
    }
    return "Flipped heads!";
  },
);
