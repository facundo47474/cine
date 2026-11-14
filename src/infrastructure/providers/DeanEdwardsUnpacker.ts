/**
 * Utilidad de desempacado seguro para bloques JavaScript ofuscados con Dean Edwards Packer
 * (`eval(function(p,a,c,k,e,d)...)`).
 *
 * Permite extraer configuraciones de reproductores (JWPlayer / VideoJS / HLS manifest URLs)
 * en servidores como Streamwish, Vidhide, Filemoon y Mixdrop sin ejecutar `eval()`.
 */

const DEAN_EDWARDS_PACKER_REGEX =
  /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)(?:,\s*\d+,\s*\{\})?\)\)/g;

const BASE62_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Convierte un índice numérico a su representación en la base especificada (`radix`),
 * soportando bases estándar (<= 36), base 62 y bases extendidas (> 62) mediante prefijos recursivos
 * idénticos a la función `e(c)` original de Dean Edwards Packer.
 *
 * @param tokenIndex Índice numérico del símbolo en la tabla `symtab`.
 * @param radix Base numérica utilizada por el empaquetador (ej. 36, 62, 95).
 * @returns Cadena codificada que representa el identificador en el payload comprimido.
 */
export function encodePackerTokenBase(tokenIndex: number, radix: number): string {
  const prefix =
    tokenIndex < radix
      ? ""
      : encodePackerTokenBase(Math.floor(tokenIndex / radix), radix);

  const remainder = tokenIndex % radix;
  if (remainder > 35) {
    return prefix + String.fromCharCode(remainder + 29);
  }
  return prefix + BASE62_ALPHABET.charAt(remainder);
}

/**
 * Busca y desempaqueta todos los bloques `eval(function(p,a,c,k,e,d)...)` presentes
 * en un documento HTML o script JavaScript.
 *
 * @param rawHtmlOrScript Contenido HTML o script potencialmente ofuscado.
 * @returns Texto plano con todos los bloques desempaquetados concatenados por saltos de línea.
 */
export function unpackDeanEdwardsPackedScripts(rawHtmlOrScript: string): string {
  if (!rawHtmlOrScript || !rawHtmlOrScript.includes("eval(function(p,a,c,k,e,")) {
    return "";
  }

  const unpackedBlocks: string[] = [];
  const regexInstance = new RegExp(DEAN_EDWARDS_PACKER_REGEX.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regexInstance.exec(rawHtmlOrScript)) !== null) {
    try {
      const compressedPayload = match[1].replace(/\\'/g, "'");
      const radix = Number(match[2]);
      const symbolCount = Number(match[3]);
      const symbolTable = match[4].split("|");

      if (!radix || !symbolCount || symbolTable.length === 0) {
        continue;
      }

      const tokenDictionary = new Map<string, string>();
      for (let index = symbolCount - 1; index >= 0; index--) {
        const replacementValue = symbolTable[index];
        if (replacementValue) {
          tokenDictionary.set(
            encodePackerTokenBase(index, radix),
            replacementValue
          );
        }
      }

      const unpackedScript = compressedPayload.replace(
        /\b[0-9a-zA-Z]+\b/g,
        (identifierToken) =>
          tokenDictionary.get(identifierToken) ?? identifierToken
      );

      unpackedBlocks.push(unpackedScript);
    } catch {
      // Si un bloque individual está truncado o malformado, continúa con el siguiente.
    }
  }

  return unpackedBlocks.join("\n");
}
