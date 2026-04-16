# compress-glb

CLI tool to compress `.glb` 3D models using **Draco**, **meshoptimizer**, and **texture optimization** (WebP via Sharp).

## Features

- **4 compression levels** — from lossless dedup to aggressive quantization
- **Draco** mesh compression (edgebreaker)
- **Meshopt** mesh simplification
- **Texture compression** — resize + convert to WebP
- **Batch mode** — point at a folder to compress all GLBs
- Zero config — sensible defaults out of the box

## Install

```bash
git clone https://github.com/mpoapostolis/compress-glb.git
cd compress-glb
npm install
```

## Usage

```bash
# Single file (default: medium compression)
node compress.mjs model.glb

# Custom output path
node compress.mjs model.glb model-min.glb

# Choose compression level
node compress.mjs model.glb --level high

# Batch compress all GLBs in a folder
node compress.mjs ./models/
```

## Compression Levels

| Level    | What it does                                          | Use case                  |
| -------- | ----------------------------------------------------- | ------------------------- |
| `low`    | Dedup, prune, flatten, resample (lossless)            | Clean up without loss     |
| `medium` | + Draco compression, textures ≤1024px (WebP)          | General use **(default)** |
| `high`   | + Mesh simplification (75%), textures ≤512px           | Web delivery              |
| `ultra`  | + Meshopt simplify (50%), textures ≤256px, quantize    | Smallest possible size    |

## Examples

```bash
# Lossless cleanup
node compress.mjs character.glb --level low

# Optimize for web
node compress.mjs scene.glb scene.min.glb --level high

# Compress everything in a directory
node compress.mjs ./assets/models/ --level medium
```

Output files are saved as `<name>.min.glb` by default.

## How it works

Built on top of [glTF Transform](https://gltf-transform.dev/) with:

- [Draco](https://google.github.io/draco/) — geometry compression
- [meshoptimizer](https://meshoptimizer.org/) — mesh simplification
- [Sharp](https://sharp.pixelplumbing.com/) — texture resize and WebP encoding

The pipeline applies transforms in order: dedup → prune → flatten → resample → weld → Draco → texture compress → simplify → quantize (depending on level).

## License

[MIT](LICENSE)
