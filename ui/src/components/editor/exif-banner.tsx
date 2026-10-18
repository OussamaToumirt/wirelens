import * as _ from 'lodash';
import * as React from 'react';
import { parse as parseExif } from 'exifr/dist/lite.esm.mjs';

import { styled, css } from '../../styles';
import { Icon } from '../../icons';
import { ContentLabel } from '../common/text-content';
import { DocsLink } from '../common/docs-link';

export type ExifTags = Record<string, unknown>;

const formatExposure = (s: number) => {
    if (!Number.isFinite(s) || s <= 0) return null;
    if (s >= 1) return `${s}s`;
    const denom = Math.round(1 / s);
    return `1/${denom}s`;
};

const formatNumber = (n: unknown, digits = 1): string | null => {
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    return Number.isInteger(n) ? String(n) : n.toFixed(digits);
};

const formatDate = (d: unknown): string | null => {
    if (d instanceof Date && !isNaN(d.getTime())) {
        // EXIF timestamps have no real timezone (cameras record local time
        // and the offset, if any, is in a separate OffsetTime tag), so the
        // Z that toISOString appends would falsely imply UTC. Strip it.
        return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
    }
    if (typeof d === 'string') return d;
    return null;
};

const formatGps = (lat: number, lon: number) => {
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(4)}°${ns} ${Math.abs(lon).toFixed(4)}°${ew}`;
};

const osmUrlFor = (lat: number, lon: number) =>
    `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;

const buildSummary = (tags: ExifTags): string => {
    const parts: string[] = [];

    const date = formatDate(tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate);
    if (date) parts.push(date);

    if (typeof tags.latitude === 'number' && typeof tags.longitude === 'number') {
        parts.push(formatGps(tags.latitude, tags.longitude));
    }

    const make = typeof tags.Make === 'string' ? tags.Make.trim() : '';
    const model = typeof tags.Model === 'string' ? tags.Model.trim() : '';
    const camera = model && make && !model.startsWith(make)
        ? `${make} ${model}`
        : (model || make);
    if (camera) parts.push(camera);

    if (typeof tags.LensModel === 'string' && tags.LensModel.trim()) {
        parts.push(tags.LensModel.trim());
    }

    const focal = formatNumber(tags.FocalLength, 0);
    if (focal) parts.push(`${focal}mm`);

    const exposure = typeof tags.ExposureTime === 'number'
        ? formatExposure(tags.ExposureTime)
        : null;
    if (exposure) parts.push(exposure);

    const fNumber = formatNumber(tags.FNumber, 1);
    if (fNumber) parts.push(`f/${fNumber}`);

    if (typeof tags.ISO === 'number') parts.push(`ISO ${tags.ISO}`);

    return parts.join(' · ');
};

const CATEGORIES: Array<{ name: string; match: (key: string) => boolean }> = [
    {
        name: 'Captured',
        match: k => /^(DateTime|CreateDate|ModifyDate|OffsetTime|SubSecTime)/.test(k)
            || k === 'GPSDateStamp' || k === 'GPSTimeStamp'
    },
    {
        name: 'Location',
        match: k => k === 'latitude' || k === 'longitude' || k.startsWith('GPS')
    },
    {
        name: 'Description',
        match: k => ['ImageDescription', 'Artist', 'Copyright', 'UserComment', 'XPTitle',
            'XPComment', 'XPAuthor', 'XPKeywords', 'XPSubject'].includes(k)
    },
    {
        name: 'Device',
        match: k => ['Make', 'Model', 'Software', 'HostComputer', 'BodySerialNumber',
            'CameraSerialNumber'].includes(k) || k.startsWith('Lens')
    },
    {
        name: 'Settings',
        match: k => /^(Exposure|FNumber|ISO|Aperture|Shutter|Flash|WhiteBalance|Metering|Scene|Saturation|Sharpness|Contrast|DigitalZoom|SubjectDistance|LightSource|Sensitivity|Brightness|FocalLength|MaxAperture|FocalPlane)/.test(k)
    },
    {
        name: 'Image',
        match: k => /^(Image|Exif|Dimension|Orientation|ColorSpace|Resolution|XResolution|YResolution|Compression|YCbCr|Photometric|Pixel|BitsPerSample|SamplesPerPixel|PlanarConfiguration|Components|Thumbnail|Interop)/.test(k)
    }
];

const OTHER_CATEGORY = 'Other';

const categoriseTag = (key: string): string => {
    for (const cat of CATEGORIES) {
        if (cat.match(key)) return cat.name;
    }
    return OTHER_CATEGORY;
};

// A row in the expanded view is either a single tag or a combined pair
// (e.g. ExifImageWidth + ExifImageHeight rendered as "ExifImage: 1920×1080").
type DisplayRow = {
    label: string;
    value: unknown;
    isLocation?: boolean;
};

// Suffix-based detection of naturally-paired tags. Lets us collapse two rows
// into one without enumerating every width/height field that exists.
const PAIR_SUFFIXES: Array<{
    a: string,
    b: string,
    label: (prefix: string) => string,
    format: (a: unknown, b: unknown) => string
}> = [
    {
        a: 'Width', b: 'Height',
        label: prefix => prefix || 'Dimensions',
        format: (w, h) => `${w}×${h}`
    },
    {
        a: 'XResolution', b: 'YResolution',
        label: prefix => `${prefix}Resolution`,
        format: (x, y) => x === y ? String(x) : `${x}×${y}`
    },
    {
        a: 'XDimension', b: 'YDimension',
        label: prefix => `${prefix}Dimensions`,
        format: (x, y) => `${x}×${y}`
    }
];

const buildRows = (tags: ExifTags): DisplayRow[] => {
    const entries = Object.entries(tags).filter(([, v]) =>
        v !== undefined && v !== null && v !== ''
    );
    const map = new Map(entries);
    const consumed = new Set<string>();
    const rows: DisplayRow[] = [];

    // Lat/lon collapse to a single Location row.
    if (typeof tags.latitude === 'number' && typeof tags.longitude === 'number') {
        consumed.add('latitude');
        consumed.add('longitude');
        rows.push({
            label: 'Location',
            value: formatGps(tags.latitude, tags.longitude),
            isLocation: true
        });
    }

    for (const [key, value] of entries) {
        if (consumed.has(key)) continue;

        let paired = false;
        for (const { a, b, label, format } of PAIR_SUFFIXES) {
            if (key.endsWith(a)) {
                const prefix = key.slice(0, -a.length);
                const partnerKey = prefix + b;
                if (map.has(partnerKey) && !consumed.has(partnerKey)) {
                    consumed.add(key);
                    consumed.add(partnerKey);
                    rows.push({
                        label: label(prefix),
                        value: format(value, map.get(partnerKey))
                    });
                    paired = true;
                    break;
                }
            }
        }
        if (!paired) rows.push({ label: key, value });
    }

    return rows;
};

const groupRows = (rows: DisplayRow[]): Array<{ name: string; rows: DisplayRow[] }> => {
    const buckets = new Map<string, DisplayRow[]>();
    for (const row of rows) {
        // Combined pairs categorise by their merged label (e.g. "ExifImage" → Image).
        // The Location row is forced into the Location category.
        const cat = row.isLocation ? 'Location' : categoriseTag(row.label);
        if (!buckets.has(cat)) buckets.set(cat, []);
        buckets.get(cat)!.push(row);
    }
    const order = [...CATEGORIES.map(c => c.name), OTHER_CATEGORY];
    return order
        .filter(name => buckets.has(name))
        .map(name => ({
            name,
            rows: buckets.get(name)!.sort((a, b) => a.label.localeCompare(b.label))
        }));
};

const formatTagValue = (value: unknown): React.ReactNode => {
    if (value instanceof Date) {
        return formatDate(value) ?? value.toString();
    }
    if (value instanceof Uint8Array) {
        if (value.length > 8) return `[${value.length} bytes]`;
        return `[${Array.from(value).join(', ')}]`;
    }
    if (Array.isArray(value) && value.every(v => typeof v === 'number')) {
        if (value.length > 8) return `[${value.length} bytes]`;
        return `[${value.join(', ')}]`;
    }
    if (typeof value === 'number') {
        return Number.isInteger(value)
            ? String(value)
            : value.toFixed(4).replace(/\.?0+$/, '');
    }
    return String(value);
};

// Margins escape the parent card's padding (15px on the directioned side, 20px
// otherwise — see cardDirectionCss) so the banner sits edge-to-edge with the
// card. Horizontal content alignment lives on the children (SummaryRow / Body)
// so the Body's background + shadows still fill the full banner width.
//
// Flex column with min-height: 0 lets the Body shrink and scroll internally
// when the parent card has limited height (e.g. inside SendBodyCardSection,
// which sets overflow-y: hidden — without this, large EXIF bodies clip).
const Banner = styled.div<{ direction?: 'left' | 'right' }>`
    ${p => p.direction === 'left'
            ? css`margin: 0 -20px 0 -15px;`
        : p.direction === 'right'
            ? css`margin: 0 -15px 0 -20px;`
        : css`margin: 0 -20px;`
    }

    display: flex;
    flex-direction: column;
    min-height: 0;

    background-color: ${p => p.theme.mainLowlightBackground};
    border-top: solid 1px ${p => p.theme.containerBorder};
    color: ${p => p.theme.mainColor};
    font-size: ${p => p.theme.textSize};
    font-family: ${p => p.theme.fontFamily};
`;

// Horizontal padding matches the parent card's content column — 15px on the
// directioned side (card has a 5px direction marker + 15px padding there),
// 20px otherwise. Used by both SummaryRow and Body so their content aligns
// with the card header while their backgrounds still span banner width.
const directionPadding = (direction?: 'left' | 'right') =>
    direction === 'left' ? css`padding-left: 15px; padding-right: 20px;`
    : direction === 'right' ? css`padding-left: 20px; padding-right: 15px;`
    : css`padding-left: 20px; padding-right: 20px;`;

const SummaryRow = styled.button<{
    expanded: boolean,
    direction?: 'left' | 'right'
}>`
    width: 100%;
    flex-shrink: 0;
    padding-top: 6px;
    padding-bottom: 6px;
    ${p => directionPadding(p.direction)}
    background: none;
    border: none;
    ${p => p.expanded && css`
        border-bottom: solid 1px ${p.theme.containerBorder};
    `}
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    display: flex;
    align-items: baseline;
    gap: 8px;
    white-space: nowrap;
    overflow: hidden;

    &:hover { color: ${p => p.theme.popColor}; }
    &:focus { outline: none; color: ${p => p.theme.popColor}; }
`;

const ToggleIcon = styled(Icon)`
    flex: 0 0 auto;
    opacity: ${p => p.theme.lowlightTextOpacity};
    width: 12px;
    align-self: center;
`;

// ContentLabel rendered as a span (its default <h2> is invalid inside a button).
const Label = styled(ContentLabel).attrs({ as: 'span' })`
    flex: 0 0 auto;
`;

const SummaryText = styled.span`
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
`;

// Matches CollapsibleSectionBody. Scrolls internally if its content
// is taller than the available space for Send page & expanded view.
const Body = styled.div<{ direction?: 'left' | 'right' }>`
    min-height: 0;
    overflow-y: auto;

    padding-top: 8px;
    padding-bottom: 10px;
    ${p => directionPadding(p.direction)}
    background-color: ${p => p.theme.mainBackground};
    box-shadow:
        inset 0px 12px 8px -10px rgba(0, 0, 0, ${p => p.theme.boxShadowAlpha}),
        inset 0px -8px 8px -10px rgba(0, 0, 0, ${p => p.theme.boxShadowAlpha});
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: fit-content(40%) 1fr;
    column-gap: 12px;
    row-gap: 2px;
`;

// Roughly matches ParameterSeparator in url-breakdown.tsx
const CategoryHeading = styled(ContentLabel)`
    grid-column: 1 / -1;
    margin-top: 10px;

    &:first-child { margin-top: 0; }
`;

const Key = styled.div`
    font-family: ${p => p.theme.monoFontFamily};
    word-break: break-all;
    text-align: right;
    opacity: ${p => p.theme.lowlightTextOpacity};
`;

const Value = styled.div`
    font-family: ${p => p.theme.monoFontFamily};
    word-break: break-word;
    white-space: pre-wrap;
`;

export const ExifBanner = (props: {
    metadata: ExifTags,
    direction?: 'left' | 'right'
}) => {
    const tags = props.metadata;
    const [expanded, setExpanded] = React.useState(false);

    const summary = buildSummary(tags) || `${Object.keys(tags).length} properties`;
    const rows = buildRows(tags);
    const groups = groupRows(rows);

    const lat = typeof tags.latitude === 'number' ? tags.latitude : null;
    const lon = typeof tags.longitude === 'number' ? tags.longitude : null;
    const mapUrl = lat !== null && lon !== null ? osmUrlFor(lat, lon) : null;

    return <Banner direction={props.direction}>
        <SummaryRow
            type='button'
            expanded={expanded}
            direction={props.direction}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Hide' : 'Show'} EXIF metadata`}
            onClick={() => setExpanded(e => !e)}
        >
            <ToggleIcon icon={['fas', expanded ? 'minus' : 'plus']} />
            <Label>EXIF Data:</Label>
            { !expanded &&
                <SummaryText title={summary}>{ summary }</SummaryText>
            }
        </SummaryRow>
        { expanded &&
            <Body direction={props.direction}>
                <Grid>
                    { groups.map(group => <React.Fragment key={group.name}>
                        <CategoryHeading>{ group.name }</CategoryHeading>
                        { group.rows.map(row => {
                            const rendered = row.isLocation && mapUrl
                                ? <DocsLink href={mapUrl}>
                                    { String(row.value) }
                                </DocsLink>
                                : formatTagValue(row.value);
                            return <React.Fragment key={row.label}>
                                <Key>{ row.label }</Key>
                                <Value>{ rendered }</Value>
                            </React.Fragment>;
                        }) }
                    </React.Fragment>) }
                </Grid>
            </Body>
        }
    </Banner>;
};

// Parse EXIF from a buffer. Resolves to undefined if no metadata or unsupported format.
export const parseImageExif = async (
    content: Buffer
): Promise<ExifTags | undefined> => {
    try {
        const view = new Uint8Array(
            content.buffer,
            content.byteOffset,
            content.byteLength
        );

        const result = await parseExif(view);

        if (!result || _.isEmpty(result)) return undefined;
        return result;
    } catch {
        // If parsing fails that's fine, we just ignore it.
        return undefined;
    }
};
