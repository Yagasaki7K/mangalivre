import { readdir, mkdir, readFile, writeFile, rm, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execSync, spawn } from "child_process";

const SOURCE_ROOT = "/mnt/d/Desktop/Mangas";
const TARGET_ROOT = "/home/yagasaki/ubuntu@dev/mangalivre";
const GIT_ROOT = "/home/yagasaki/ubuntu@dev/mangalivre";

const FOLDERS = [
    {
        folder: "Chainsaw Man",
        targetFolder: "Chainsaw Man",
        regex: /^Chainsaw Man\s*-\s*Volume\s*(\d+)$/i,
        label: (n: number) => `Chainsaw Man Vol.${n}`,
    },
    {
        folder: "Demon Slayer – Kimetsu no Yaiba",
        targetFolder: "Demon Slayer",
        regex: /^Demon Slayer\s*-\s*(\d+)$/i,
        label: (n: number) => `Demon Slayer Vol.${n}`,
    },
    {
        folder: "FRIEREN",
        targetFolder: "Frieren",
        regex: /^FRIEREN\s+VOL\.?\s*(\d+)$/i,
        label: (n: number) => `Frieren Vol.${n}`,
    },
    {
        folder: "Hell’s Paradise",
        targetFolder: "Hells Paradise",
        regex: /^Hells\s+Paradise\s+Vol\.?\s*(\d+)$/i,
        label: (n: number) => `Hells Paradise Vol.${n}`,
    },
    {
        folder: "HUNTER X HUNTER",
        targetFolder: "Hunter x Hunter",
        regex: /^Hunter\s*x\s*Hunter\s*-\s*Volume\s*(\d+)$/i,
        label: (n: number) => `Hunter x Hunter Vol.${n}`,
    },
    {
        folder: "NARUTO",
        targetFolder: "Naruto",
        regex: /^Naruto\s*-\s*Volume\s*(\d+)$/i,
        label: (n: number) => `Naruto Vol.${n}`,
    },
    {
        folder: "Neon Genesis Evangelion - Collectors Edition",
        targetFolder: "Neon Genesis Evangelion - Collectors Edition",
        regex: /^Neon Genesis Evangelion\s*-\s*Collectors Edition\s*-\s*Vol\.?\s*(\d+)$/i,
        label: (n: number) => `Neon Genesis Evangelion - Collectors Edition Vol.${n}`,
    },
    {
        folder: "Soul Eater",
        targetFolder: "Soul Eater",
        regex: /^Soul Eater\s*-\s*Volume\s*(\d+)$/i,
        label: (n: number) => `Soul Eater Vol.${n}`,
    },
    {
        folder: "Tokyo Ghoul",
        targetFolder: "Tokyo Ghoul",
        regex: /^Tokyo Ghoul\s*-\s*Volume\s*(\d+)$/i,
        label: (n: number) => `Tokyo Ghoul Vol.${n}`,
    },
    {
        folder: "Tokyo Ghoul RE",
        targetFolder: "Tokyo Ghoul RE",
        regex: /^Tokyo Ghoul RE\s*-\s*Vol\.?\s*(\d+)$/i,
        label: (n: number) => `Tokyo Ghoul RE Vol.${n}`,
    },
];

async function folderExists(path: string): Promise<boolean> {
    try {
        const s = await stat(path);
        return s.isDirectory();
    } catch {
        return false;
    }
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

interface ParsedPdf {
    fileName: string;
    volumeLabel: string;
    order: number;
}

function renderProgress(current: number, total: number, label: string) {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    const barLength = 30;
    const filled = Math.round((percent / 100) * barLength);
    const empty = barLength - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);

    const line = `\r   📄 ${label} | ${current}/${total} | ${bar} ${percent}%`;
    process.stdout.write(line.padEnd(120, " "));
}

function finishProgress() {
    process.stdout.write("\n");
}

function countPngFiles(dir: string): number {
    try {
        const result = execSync(`ls "${dir}" | grep -c '\\.png$' || true`, {
            encoding: "utf-8",
        });
        return Number.parseInt(result.trim(), 10) || 0;
    } catch {
        return 0;
    }
}

async function main() {
    console.log("🚀 Iniciando processamento...");
    console.log("📂 Origem: ", SOURCE_ROOT);
    console.log("📂 Destino:", TARGET_ROOT);
    console.log("📂 Git root:", GIT_ROOT);
    console.log();

    let processados = 0;
    let ignorados = 0;
    let falhas = 0;

    for (const config of FOLDERS) {
        const sourceDir = join(SOURCE_ROOT, config.folder);
        const targetDir = join(TARGET_ROOT, config.targetFolder);

        console.log(`\n📚 Processando pasta: ${config.folder}`);

        if (!(await folderExists(sourceDir))) {
            console.log(`⚠️  Pasta de origem não encontrada: ${sourceDir}`);
            continue;
        }

        let entries: string[] = [];
        try {
            entries = await readdir(sourceDir);
        } catch (err) {
            console.error(`❌ Não foi possível ler ${sourceDir}:`, err);
            falhas++;
            continue;
        }

        const parsed: ParsedPdf[] = [];

        for (const name of entries) {
            const base = name.replace(/\.pdf$/i, "").trim();
            const match = base.match(config.regex);

            if (!match) {
                continue;
            }

            const num = Number.parseInt(match[1] ?? "0", 10);

            if (Number.isNaN(num)) {
                continue;
            }

            parsed.push({
                fileName: name,
                volumeLabel: config.label(num),
                order: num,
            });
        }

        if (parsed.length === 0) {
            console.log(`⚠️  Nenhum PDF válido encontrado em ${config.folder}`);
            continue;
        }

        parsed.sort((a, b) => a.order - b.order);

        console.log(`   ${parsed.length} PDFs encontrados`);

        for (const item of parsed) {
            const destPath = join(targetDir, item.volumeLabel);

            if (await folderExists(destPath)) {
                console.log(`   ⏭️  ${item.volumeLabel} já existe, ignorando.`);
                ignorados++;
                continue;
            }

            try {
                await processVolume(
                    item.volumeLabel,
                    join(sourceDir, item.fileName),
                    targetDir,
                );
                await commitAndPush(item.volumeLabel);
                processados++;
            } catch (err) {
                falhas++;
                console.error(`\n   ❌ Erro em ${item.volumeLabel}:`, err);
            }
        }
    }

    console.log(`\n✅ Processamento concluído!`);
    console.log(`   Processados: ${processados}`);
    console.log(`   Ignorados:   ${ignorados}`);
    console.log(`   Falhas:      ${falhas}`);

    if (falhas > 0) {
        process.exit(1);
    }
}

async function processVolume(
    volumeLabel: string,
    pdfPath: string,
    targetDir: string,
) {
    const destPath = join(targetDir, volumeLabel);

    console.log(`\n   📖 Processando: ${volumeLabel}`);

    await mkdir(destPath, { recursive: true });

    const prefix = volumeLabel;
    const tmpDir = join(
        tmpdir(),
        `mangalivre-${Date.now()}-${slugify(volumeLabel)}`,
    );
    await mkdir(tmpDir, { recursive: true });

    try {
        const outputBase = join(tmpDir, "page");

        const totalPages = await getPdfPageCount(pdfPath);

        console.log(`      Total de páginas detectado: ${totalPages}`);

        const args = ["-png", "-r", "150", pdfPath, outputBase];

        await new Promise<void>((resolve, reject) => {
            const child = spawn("pdftoppm", args, { stdio: "pipe" });

            child.on("error", (err) => {
                reject(
                    new Error(
                        `pdftoppm falhou em "${volumeLabel}". ` +
                        `Verifique se o poppler-utils está instalado (sudo apt install poppler-utils). ` +
                        `Erro original: ${err.message}`,
                    ),
                );
            });

            child.on("close", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`pdftoppm saiu com código ${code}`));
                }
            });

            const interval = setInterval(() => {
                const current = countPngFiles(tmpDir);
                renderProgress(current, totalPages, volumeLabel);
            }, 200);

            child.on("close", () => clearInterval(interval));
        });

        finishProgress();

        const files = (await readdir(tmpDir))
            .filter((f) => f.toLowerCase().endsWith(".png"))
            .sort();

        if (files.length === 0) {
            throw new Error(`Nenhuma imagem gerada para "${volumeLabel}".`);
        }

        let pageNumber = 1;
        for (const file of files) {
            const newName = `${prefix}-${String(pageNumber).padStart(3, "0")}.png`;
            const data = await readFile(join(tmpDir, file));
            await writeFile(join(destPath, newName), data);
            pageNumber++;
        }

        console.log(
            `      ✅ ${files.length} páginas convertidas e salvas para "${volumeLabel}"`,
        );
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}

async function getPdfPageCount(pdfPath: string): Promise<number> {
    try {
        const result = execSync(`pdfinfo "${pdfPath}" | grep Pages`, {
            encoding: "utf-8",
        });
        const match = result.match(/Pages:\s+(\d+)/);
        return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
    } catch {
        return 0;
    }
}

async function commitAndPush(volumeLabel: string) {
    console.log(`      📦 Commitando "${volumeLabel}"...`);

    try {
        execSync("git add .", { cwd: GIT_ROOT, stdio: "inherit" });
        execSync(`git commit -m "Update: ${volumeLabel}"`, {
            cwd: GIT_ROOT,
            stdio: "inherit",
        });
        execSync("git push", { cwd: GIT_ROOT, stdio: "inherit" });

        console.log(`      ✅ "${volumeLabel}" commitado e enviado.`);
    } catch (err) {
        throw new Error(
            `Falha ao commitar/enviar "${volumeLabel}". ` +
            `Erro original: ${(err as Error).message}`,
        );
    }
}

main().catch((err) => {
    console.error("\n💥 Erro fatal:", err);
    process.exit(1);
});