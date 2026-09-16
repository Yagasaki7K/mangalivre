import { readdir, mkdir, readFile, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync, execSync } from "child_process";

const SOURCE_DIR = "/mnt/c/Users/yagasaki/Downloads/Berserk-20260916T020158Z-1-001/Berserk";
const TARGET_DIR = "/home/yagasaki/ubuntu@dev/mangalivre/Berserk";
const MANGA_NAME = "Berserk";

const volumeRegex = /^BERSERK VOL\.?\s*(\d+)\.pdf$/i;

async function main() {
    console.log("🚀 Iniciando processamento...");
    console.log("📂 Origem: ", SOURCE_DIR);
    console.log("📂 Destino:", TARGET_DIR);
    console.log();

    let entries: string[] = [];
    try {
        entries = await readdir(SOURCE_DIR);
    } catch (err) {
        console.error("❌ Não foi possível ler a pasta de origem:", err);
        process.exit(1);
    }

    const volumes = entries
        .map((name) => {
            const match = name.match(volumeRegex);
            if (!match) return null;
            const number = Number.parseInt(match[1] ?? "", 10);
            if (Number.isNaN(number)) return null;
            return { name, number };
        })
        .filter((v): v is { name: string; number: number } => v !== null)
        .sort((a, b) => a.number - b.number);

    if (volumes.length === 0) {
        console.log("⚠️  Nenhum PDF de volume encontrado.");
        return;
    }

    console.log(`📚 ${volumes.length} volumes encontrados\n`);

    let processados = 0;
    let falhas = 0;

    for (const vol of volumes) {
        try {
            await processVolume(vol.number, join(SOURCE_DIR, vol.name));
            await commitAndPush(vol.number);
            processados++;
        } catch (err) {
            falhas++;
            console.error(`❌ Erro no volume ${vol.number}:`, err);
        }
    }

    console.log(`\n✅ Processamento concluído!`);
    console.log(`   Volumes processados: ${processados}`);
    console.log(`   Volumes com falha:   ${falhas}`);

    if (falhas > 0) {
        process.exit(1);
    }
}

async function processVolume(volumeNumber: number, pdfPath: string) {
    const volumeFolder = `Volume ${volumeNumber}`;
    const destPath = join(TARGET_DIR, volumeFolder);

    console.log(`📖 Processando Volume ${volumeNumber}`);

    await mkdir(destPath, { recursive: true });

    const prefix = `${MANGA_NAME.toUpperCase()} VOL.${String(volumeNumber).padStart(2, "0")}`;

    const tmpDir = join(tmpdir(), `mangalivre-${Date.now()}-${volumeNumber}`);
    await mkdir(tmpDir, { recursive: true });

    try {
        const outputBase = join(tmpDir, "page");

        try {
            execFileSync("pdftoppm", [
                "-png",
                "-r",
                "150",
                pdfPath,
                outputBase,
            ], { stdio: "pipe" });
        } catch (err) {
            throw new Error(
                `pdftoppm falhou no volume ${volumeNumber}. ` +
                `Verifique se o poppler-utils está instalado (sudo apt install poppler-utils). ` +
                `Erro original: ${(err as Error).message}`
            );
        }

        const files = (await readdir(tmpDir))
            .filter((f) => f.toLowerCase().endsWith(".png"))
            .sort();

        if (files.length === 0) {
            throw new Error(`Nenhuma imagem gerada para o volume ${volumeNumber}.`);
        }

        let pageNumber = 1;
        for (const file of files) {
            const newName = `${prefix}-${String(pageNumber).padStart(3, "0")}.png`;
            const data = await readFile(join(tmpDir, file));
            await writeFile(join(destPath, newName), data);
            pageNumber++;
        }

        console.log(`   ✅ ${files.length} páginas exportadas para ${volumeFolder}`);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}

async function commitAndPush(volumeNumber: number) {
    console.log(`   📦 Commitando Volume ${volumeNumber}...`);

    try {
        execSync("git add .", { cwd: TARGET_DIR, stdio: "pipe" });
        execSync(`git commit -am "Update: Berserk Vol.${volumeNumber}"`, {
            cwd: TARGET_DIR,
            stdio: "pipe",
        });
        execSync("git push", { cwd: TARGET_DIR, stdio: "pipe" });

        console.log(`   ✅ Volume ${volumeNumber} commitado e enviado.`);
    } catch (err) {
        throw new Error(
            `Falha ao commitar/enviar o volume ${volumeNumber}. ` +
            `Erro original: ${(err as Error).message}`
        );
    }
}

main().catch((err) => {
    console.error("💥 Erro fatal:", err);
    process.exit(1);
});