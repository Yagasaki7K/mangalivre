import { readdir, mkdir, readFile, writeFile, rm, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync, execSync } from "child_process";

const SOURCE_DIR = "/mnt/c/Users/yagasaki/Downloads/4 - Absolute Batman-20260911T193158Z-1-001/4 - Absolute Batman";
const TARGET_DIR = "/home/yagasaki/ubuntu@dev/mangalivre/Absolute Batman";
const GIT_ROOT = "/home/yagasaki/ubuntu@dev/mangalivre";

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
}

function parsePdfName(fileName: string): ParsedPdf | null {
    const base = fileName.replace(/\.pdf$/i, "").trim();

    // Padrão: "Absolute Batman SPECIAL_ ARK-M #15 (darkseid club)"
    const specialMatch = base.match(/^Absolute Batman\s+SPECIAL[_\s]+([A-Za-z\-]+)\s*#(\d+)/i);
    if (specialMatch) {
        const name = (specialMatch[1] ?? "").toUpperCase().replace(/_/g, " ");
        const num = specialMatch[2] ?? "";
        return {
            fileName,
            volumeLabel: `Absolute Batman Special ${name} Vol.${num}`,
        };
    }

    // Padrão: "Anual 1 - Absolute Batman #1 (darkseid club)"
    const anualMatch = base.match(/^Anual\s+(\d+)\s*-\s*Absolute Batman\s*#(\d+)/i);
    if (anualMatch) {
        const num = anualMatch[1] ?? "";
        return {
            fileName,
            volumeLabel: `Absolute Batman Anual Vol.${num}`,
        };
    }

    // Padrão: "Absolute Batman #13 (darkseid club)"
    const normalMatch = base.match(/^Absolute Batman\s*#(\d+)/i);
    if (normalMatch) {
        const num = normalMatch[1] ?? "";
        return {
            fileName,
            volumeLabel: `Absolute Batman Vol.${num}`,
        };
    }

    return null;
}

async function main() {
    console.log("🚀 Iniciando processamento...");
    console.log("📂 Origem: ", SOURCE_DIR);
    console.log("📂 Destino:", TARGET_DIR);
    console.log("📂 Git root:", GIT_ROOT);
    console.log();

    let entries: string[] = [];
    try {
        entries = await readdir(SOURCE_DIR);
    } catch (err) {
        console.error("❌ Não foi possível ler a pasta de origem:", err);
        process.exit(1);
    }

    const parsed = entries
        .map((name) => parsePdfName(name))
        .filter((p): p is ParsedPdf => p !== null);

    if (parsed.length === 0) {
        console.log("⚠️  Nenhum PDF válido encontrado.");
        return;
    }

    parsed.sort((a, b) => a.volumeLabel.localeCompare(b.volumeLabel, "pt-BR", { numeric: true }));

    console.log(`📚 ${parsed.length} PDFs encontrados\n`);

    let processados = 0;
    let ignorados = 0;
    let falhas = 0;

    for (const item of parsed) {
        const destPath = join(TARGET_DIR, item.volumeLabel);

        if (await folderExists(destPath)) {
            console.log(`⏭️  ${item.volumeLabel} já existe, ignorando.`);
            ignorados++;
            continue;
        }

        try {
            await processVolume(item.volumeLabel, join(SOURCE_DIR, item.fileName));
            await commitAndPush(item.volumeLabel);
            processados++;
        } catch (err) {
            falhas++;
            console.error(`❌ Erro em ${item.volumeLabel}:`, err);
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

async function processVolume(volumeLabel: string, pdfPath: string) {
    const destPath = join(TARGET_DIR, volumeLabel);

    console.log(`📖 Processando: ${volumeLabel}`);

    await mkdir(destPath, { recursive: true });

    const prefix = volumeLabel;
    const tmpDir = join(tmpdir(), `mangalivre-${Date.now()}-${slugify(volumeLabel)}`);
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
                `pdftoppm falhou em "${volumeLabel}". ` +
                `Verifique se o poppler-utils está instalado (sudo apt install poppler-utils). ` +
                `Erro original: ${(err as Error).message}`
            );
        }

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

        console.log(`   ✅ ${files.length} páginas exportadas para "${volumeLabel}"`);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}

async function commitAndPush(volumeLabel: string) {
    console.log(`   📦 Commitando "${volumeLabel}"...`);

    try {
        execSync("git add .", { cwd: GIT_ROOT, stdio: "pipe" });
        execSync(`git commit -am "Update: ${volumeLabel}"`, {
            cwd: GIT_ROOT,
            stdio: "pipe",
        });
        execSync("git push", { cwd: GIT_ROOT, stdio: "pipe" });

        console.log(`   ✅ "${volumeLabel}" commitado e enviado.`);
    } catch (err) {
        throw new Error(
            `Falha ao commitar/enviar "${volumeLabel}". ` +
            `Erro original: ${(err as Error).message}`
        );
    }
}

main().catch((err) => {
    console.error("💥 Erro fatal:", err);
    process.exit(1);
});