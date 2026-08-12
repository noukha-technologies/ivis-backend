export class Helpers {
  public static enumToArray = (
    enumObject: Record<string, unknown>,
  ): unknown[] => {
    const enumArray = [];
    for (const enumName in enumObject) {
      enumArray.push(enumObject[enumName]);
    }
    return enumArray;
  };
}

/**
 * Natural sort function that handles both numeric patterns (e.g., "Line - 1")
 * and non-numeric names (e.g., "Chennai")
 * Uses a standard natural sort algorithm that compares strings and numbers properly
 */

export function naturalSort(items: any[], field: string): any[] {
  return [...items].sort((a, b) => {
    const aValue = String(a[field] || '');
    const bValue = String(b[field] || '');

    // Split strings into chunks of text and numbers
    const chunkify = (str: string): (string | number)[] => {
      const chunks: (string | number)[] = [];
      let currentChunk = '';
      let isNumber = false;

      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const charIsNumber = /\d/.test(char);

        if (i === 0) {
          isNumber = charIsNumber;
          currentChunk = char;
        } else if (charIsNumber === isNumber) {
          currentChunk += char;
        } else {
          chunks.push(
            isNumber ? parseInt(currentChunk, 10) : currentChunk.toLowerCase(),
          );
          currentChunk = char;
          isNumber = charIsNumber;
        }
      }

      if (currentChunk) {
        chunks.push(
          isNumber ? parseInt(currentChunk, 10) : currentChunk.toLowerCase(),
        );
      }

      return chunks;
    };

    const aChunks = chunkify(aValue);
    const bChunks = chunkify(bValue);
    const minLength = Math.min(aChunks.length, bChunks.length);

    for (let i = 0; i < minLength; i++) {
      const aChunk = aChunks[i];
      const bChunk = bChunks[i];

      // If both are numbers, compare numerically
      if (typeof aChunk === 'number' && typeof bChunk === 'number') {
        if (aChunk !== bChunk) {
          return aChunk - bChunk;
        }
      }
      // If both are strings, compare alphabetically
      else if (typeof aChunk === 'string' && typeof bChunk === 'string') {
        const compare = aChunk.localeCompare(bChunk);
        if (compare !== 0) {
          return compare;
        }
      }
      // Numbers come before strings
      else if (typeof aChunk === 'number') {
        return -1;
      } else {
        return 1;
      }
    }

    // If all chunks are equal up to minLength, shorter string comes first
    return aChunks.length - bChunks.length;
  });
}
