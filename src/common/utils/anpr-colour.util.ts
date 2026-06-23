const KNOWN_COLOURS = [
    'white', 'yellow', 'red', 'blue', 'gray', 'grey', 'brown', 'black',
    'green', 'silver', 'orange', 'beige', 'gold', 'purple', 'pink',
];

const FIELD_BOUNDARIES = [
    'vehicle type', 'vehicle brand', 'brand', 'moving direction', 'direction',
    'plate color', 'plate colour', 'plate size', 'plate type', 'province',
    'category', 'confidence', 'capture time', 'lane',
];

export function normalizeAnprColour(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const text = raw.toLowerCase().trim();

    for (const boundary of FIELD_BOUNDARIES) {
        const idx = text.indexOf(boundary);
        if (idx > 0) {
            const segment = text.slice(0, idx).trim();
            for (const colour of KNOWN_COLOURS) {
                if (segment.includes(colour)) {
                    return colour.charAt(0).toUpperCase() + colour.slice(1);
                }
            }
        }
    }

    for (const colour of KNOWN_COLOURS) {
        if (text.includes(colour)) {
            return colour.charAt(0).toUpperCase() + colour.slice(1);
        }
    }

    return null;
}
