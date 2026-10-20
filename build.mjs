import { readFile, writeFile, mkdir } from "fs/promises";
import { extname } from "path";
import { createHash } from "crypto";

import { rollup } from "rollup";
import esbuild from "rollup-plugin-esbuild";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import swc from "@swc/core";

const extensions = [".js", ".jsx", ".mjs", ".ts", ".tsx", ".cts", ".mts"];

const plugins = [
    nodeResolve(),
    commonjs(),
    {
        name: "swc",
        async transform(code, id) {
            const ext = extname(id);
            if (!extensions.includes(ext)) return null;

            const ts = ext.includes("ts");
            const tsx = ts ? ext.endsWith("x") : undefined;
            const jsx = !ts ? ext.endsWith("x") : undefined;

            const result = await swc.transform(code, {
                filename: id,
                jsc: {
                    externalHelpers: true,
                    parser: {
                        syntax: ts ? "typescript" : "ecmascript",
                        tsx,
                        jsx,
                    },
                },
                env: {
                    targets: "defaults",
                    include: [
                        "transform-classes",
                        "transform-arrow-functions",
                    ],
                },
            });
            return result.code;
        },
    },
    esbuild({ minify: true }),
];

try {
    await mkdir("./dist", { recursive: true });
    
    // 1. قراءة الملف الأصلي
    const manifest = JSON.parse(await readFile(`./plugins/auto-join/manifest.json`));
    const entryFile = `./plugins/auto-join/${manifest.main}`; // سيعتمد على src/index.ts
    const outPath = `./dist/index.js`;

    // 2. تجميع الكود تحويله إلى JS
    const bundle = await rollup({
        input: entryFile,
        onwarn: () => {},
        plugins,
    });

    await bundle.write({
        file: outPath,
        globals(id) {
            if (id.startsWith("@vendetta")) return id.substring(1).replace(/\//g, ".");
            const map = { react: "window.React" };
            return map[id] || null;
        },
        format: "iife",
        compact: true,
        exports: "named",
    });
    await bundle.close();

    // 3. تجهيز ملف manifest.json الموجه لتطبيق Revenge
    const toHash = await readFile(outPath);
    manifest.hash = createHash("sha256").update(toHash).digest("hex");
    manifest.main = "index.js"; // تعديل المسار هنا ليصبح جاهزاً للعميل

    await writeFile(`./dist/manifest.json`, JSON.stringify(manifest));

    console.log(`Successfully built ${manifest.name}!`);
} catch (e) {
    console.error("Failed to build plugin...", e);
    process.exit(1);
}
