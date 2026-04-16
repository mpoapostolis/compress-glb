#!/usr/bin/env node
/**
 * GLB Compressor — standalone CLI tool
 *
 * Usage:
 *   node compress.mjs <input.glb> [output.glb] [--level low|medium|high|ultra]
 *   node compress.mjs ./models/              # compress all GLBs in folder
 *   node compress.mjs city.glb city-min.glb --level ultra
 *
 * Levels:
 *   low    — lossless: dedup, flatten, no texture resize
 *   medium — Draco compression, textures ≤1024 (default)
 *   high   — Draco + aggressive simplify, textures ≤512
 *   ultra  — Meshopt + Draco, textures ≤256, quantize everything
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "fs";
import { resolve, basename, extname, join } from "path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  flatten,
  join as joinMeshes,
  weld,
  simplify,
  resample,
  prune,
  textureCompress,
  quantize,
  draco,
} from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

// ── Parse CLI args ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`
  GLB Compressor — Compress .glb files with Draco + texture optimization

  Usage:
    node compress.mjs <input.glb> [output.glb] [--level low|medium|high|ultra]
    node compress.mjs <folder/>                # batch compress all GLBs

  Levels:
    low    — dedup + prune (lossless)
    medium — Draco + textures ≤1024 (default)
    high   — Draco + simplify 75% + textures ≤512
    ultra  — Draco + Meshopt simplify 50% + textures ≤256 + quantize
  `);
  process.exit(0);
}

let inputPath = args[0];
let outputPath = args[1] && !args[1].startsWith("--") ? args[1] : null;
const levelIdx = args.indexOf("--level");
const level = levelIdx !== -1 ? args[levelIdx + 1] : "medium";

if (!["low", "medium", "high", "ultra"].includes(level)) {
  console.error(`Invalid level: ${level}. Use low, medium, high, or ultra.`);
  process.exit(1);
}

// ── Setup IO ────────────────────────────────────────────────────────────────

await MeshoptSimplifier.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule(),
  });

// ── Compression pipeline ────────────────────────────────────────────────────

async function compressFile(input, output) {
  const inputSize = statSync(input).size;
  console.log(`\n📦 ${basename(input)} (${(inputSize / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`   Level: ${level}`);

  const doc = await io.read(input);

  // ── All levels: dedup + prune (lossless) ──
  await doc.transform(dedup(), prune(), flatten(), resample());

  // ── Medium+: Draco compression + texture resize ──
  if (level !== "low") {
    const maxTex = level === "ultra" ? 256 : level === "high" ? 512 : 1024;

    await doc.transform(
      weld({ tolerance: 0.001 }),
      draco({
        method: "edgebreaker",
        encodeSpeed: 5,
        decodeSpeed: 5,
        quantizePosition: level === "ultra" ? 11 : 14,
        quantizeNormal: level === "ultra" ? 8 : 10,
        quantizeTexcoord: level === "ultra" ? 10 : 12,
      }),
      textureCompress({
        encoder: sharp,
        targetFormat: "webp",
        resize: [maxTex, maxTex],
      }),
    );
  }

  // ── High+: mesh simplification ──
  if (level === "high" || level === "ultra") {
    const ratio = level === "ultra" ? 0.5 : 0.75;
    const error = level === "ultra" ? 0.01 : 0.005;
    await doc.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio, error }),
    );
  }

  // ── Ultra: quantize all attributes ──
  if (level === "ultra") {
    await doc.transform(quantize());
  }

  // ── Write output ──
  const bytes = await io.writeBinary(doc);
  writeFileSync(output, Buffer.from(bytes));

  const outputSize = statSync(output).size;
  const saved = ((1 - outputSize / inputSize) * 100).toFixed(1);
  console.log(`   ✅ ${(outputSize / 1024 / 1024).toFixed(2)} MB → saved ${saved}%`);
  console.log(`   → ${output}`);
}

// ── Batch or single ─────────────────────────────────────────────────────────

inputPath = resolve(inputPath);

if (existsSync(inputPath) && statSync(inputPath).isDirectory()) {
  // Batch: compress all .glb files in folder
  const files = readdirSync(inputPath).filter((f) => extname(f).toLowerCase() === ".glb");
  if (files.length === 0) {
    console.log("No .glb files found in", inputPath);
    process.exit(0);
  }
  console.log(`Found ${files.length} GLB files in ${inputPath}`);
  for (const file of files) {
    const inp = join(inputPath, file);
    const out = join(inputPath, file.replace(/\.glb$/i, `.min.glb`));
    await compressFile(inp, out);
  }
} else if (existsSync(inputPath)) {
  // Single file
  const out = outputPath
    ? resolve(outputPath)
    : inputPath.replace(/\.glb$/i, `.min.glb`);
  await compressFile(inputPath, out);
} else {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

console.log("\n🎉 Done!");
