const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_MINIMAP_SCALE = 1;

function normalizeMinimapScale(rawValue) {
  let value = Number.parseFloat(String(rawValue).replace(",", "."));
  if (!Number.isFinite(value)) return null;

  // Algumas versões/configuradores salvam 75 em vez de 0.75.
  if (value > 2) value /= 100;
  return Math.min(2, Math.max(0.25, value));
}

function findNamedSetting(node, wantedName) {
  if (!node || typeof node !== "object") return null;

  if (
    typeof node.name === "string" &&
    node.name.toLocaleLowerCase("en-US") === wantedName.toLocaleLowerCase("en-US") &&
    Object.prototype.hasOwnProperty.call(node, "value")
  ) {
    return node.value;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key.toLocaleLowerCase("en-US") === wantedName.toLocaleLowerCase("en-US")) {
      return value;
    }

    const nestedValue = findNamedSetting(value, wantedName);
    if (nestedValue !== null && nestedValue !== undefined) return nestedValue;
  }

  return null;
}

function parsePersistedSettings(content) {
  try {
    const document = JSON.parse(content);
    return normalizeMinimapScale(findNamedSetting(document, "MinimapScale"));
  } catch {
    return null;
  }
}

function parseGameCfg(content) {
  const match = String(content).match(/^\s*MinimapScale\s*=\s*([^\r\n;#]+)/im);
  return match ? normalizeMinimapScale(match[1].trim()) : null;
}

async function findInstallPathFromRiotMetadata() {
  if (process.platform !== "win32") return null;

  const programData = process.env.ProgramData || "C:\\ProgramData";
  const metadataPath = path.win32.join(
    programData,
    "Riot Games",
    "Metadata",
    "league_of_legends.live",
    "league_of_legends.live.product_settings.yaml"
  );

  try {
    const yaml = await fs.readFile(metadataPath, "utf8");
    const match = yaml.match(/^\s*product_install_full_path:\s*["']?(.+?)["']?\s*$/im);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

async function getConfigDirectories() {
  const directories = [];
  const explicitDirectory = process.env.LOL_CONFIG_DIR || process.env.LEAGUE_CONFIG_DIR;
  if (explicitDirectory) directories.push(explicitDirectory);

  const metadataInstallPath = await findInstallPathFromRiotMetadata();
  if (metadataInstallPath) directories.push(path.win32.join(metadataInstallPath, "Config"));

  const systemDrive = process.env.SystemDrive || "C:";
  directories.push(path.win32.join(systemDrive, "Riot Games", "League of Legends", "Config"));

  if (process.env.ProgramFiles) {
    directories.push(
      path.win32.join(process.env.ProgramFiles, "Riot Games", "League of Legends", "Config")
    );
  }

  return [...new Set(directories.map((directory) => path.normalize(directory)))];
}

async function readMinimapScale() {
  const configDirectories = await getConfigDirectories();

  for (const configDirectory of configDirectories) {
    const candidates = [
      {
        sourcePath: path.join(configDirectory, "PersistedSettings.json"),
        parser: parsePersistedSettings
      },
      {
        sourcePath: path.join(configDirectory, "game.cfg"),
        parser: parseGameCfg
      }
    ];

    for (const candidate of candidates) {
      try {
        const content = await fs.readFile(candidate.sourcePath, "utf8");
        const value = candidate.parser(content);
        if (value !== null) return { value, sourcePath: candidate.sourcePath };
      } catch {
        // Tenta o próximo arquivo/diretório conhecido.
      }
    }
  }

  return { value: DEFAULT_MINIMAP_SCALE, sourcePath: null };
}

module.exports = {
  DEFAULT_MINIMAP_SCALE,
  findNamedSetting,
  findInstallPathFromRiotMetadata,
  getConfigDirectories,
  normalizeMinimapScale,
  parseGameCfg,
  parsePersistedSettings,
  readMinimapScale
};
