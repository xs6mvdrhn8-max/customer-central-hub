#!/usr/bin/env node

const fs = require("fs");

const path = require("path");

function printUsage() {
  console.error(
    "Usage: node scripts/prepare_import_backup.js <input.json> [output.json]"
  );
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function removeInlineImages(products) {
  let removedCount = 0;

  let removedBytes = 0;

  const nextProducts = products.map((product) => {
    if (!product || typeof product !== "object") {
      return product;
    }

    const imageUrl = typeof product.imageUrl === "string" ? product.imageUrl : "";

    if (!imageUrl.startsWith("data:")) {
      return product;
    }

    removedCount += 1;

    removedBytes += imageUrl.length;

    return {
      ...product,

      imageUrl: "",
    };
  });

  return {
    nextProducts,

    removedCount,

    removedBytes,
  };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function main() {
  const [, , inputArg, outputArg] = process.argv;

  if (!inputArg) {
    printUsage();

    process.exit(1);
  }

  const inputPath = path.resolve(inputArg);

  const outputPath = path.resolve(
    outputArg ||
      inputPath.replace(/\.json$/i, "") + "_import_lite.json"
  );

  const payload = readJson(inputPath);

  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;

  const products = Array.isArray(data.products) ? data.products : [];

  const { nextProducts, removedCount, removedBytes } = removeInlineImages(products);

  const nextPayload = payload?.data && typeof payload.data === "object"
    ? {
        ...payload,

        data: {
          ...payload.data,

          products: nextProducts,
        },
      }
    : {
        ...payload,

        products: nextProducts,
      };

  fs.writeFileSync(outputPath, JSON.stringify(nextPayload, null, 2));

  const inputSize = fs.statSync(inputPath).size;

  const outputSize = fs.statSync(outputPath).size;

  console.log(
    JSON.stringify(
      {
        input: inputPath,

        output: outputPath,

        inputSize,

        outputSize,

        savedBytes: inputSize - outputSize,

        savedReadable: formatBytes(inputSize - outputSize),

        removedInlineImages: removedCount,

        removedImageBytes: removedBytes,
      },

      null,

      2
    )
  );
}

main();
