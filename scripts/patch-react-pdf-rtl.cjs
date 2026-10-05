// Temporary compatibility fix for @react-pdf/textkit 6.3.0.
// Based on upstream PR https://github.com/diegomura/react-pdf/pull/3407 (MIT).
// Rebuild visual runs by source glyph cluster, preserving repeated Arabic ligatures.
// Fail on unexpected upstream code rather than silently applying an obsolete patch.
const fs = require('node:fs');
const path = require('node:path');
const file = require.resolve('@react-pdf/textkit');
const packageFile = path.join(path.dirname(file), '../package.json');
const version = JSON.parse(fs.readFileSync(packageFile,'utf8')).version;
let source = fs.readFileSync(file,'utf8');
if (source.includes('crmArabicClusterOwnership')) process.exit(0);
if (version !== '6.3.0') throw new Error('Review/remove the Arabic PDF patch for textkit ' + version);
const lookupStart=source.indexOf('const getItemAtIndex = (runs, objectName, index) => {');
const lookupEnd=source.indexOf('const reorderLine =',lookupStart);
const runsStart=source.indexOf('    const updatedRuns = line.runs.map((run) => {',lookupEnd);
const runsEnd=source.indexOf('\n    return {\n        box: line.box,',runsStart);
if ([lookupStart,lookupEnd,runsStart,runsEnd].some(n=>n<0)) throw new Error('Unexpected textkit layout; Arabic patch not applied');
const lookup=`// crmArabicClusterOwnership
const getRunItemAtIndex = (runs, index) => {
    for (const run of runs) {
        if (index >= run.start && index < run.end) {
            const glyphIndex = run.stringIndices?.[index - run.start];
            if (glyphIndex !== undefined) return { run, glyphIndex };
        }
    }
    throw new Error('Arabic glyph cluster index out of range: ' + index);
};
`;
const rebuild=`    const updatedRuns = [];
    let currentRun = null, currentStart = 0;
    let currentGlyphs = [], currentGlyphIndices = [], currentPositions = [], currentStringIndices = [];
    let clusters = new Map();
    const flushRun = (end) => {
        if (!currentRun) return;
        updatedRuns.push({ ...currentRun, start: currentStart, end, glyphs: currentGlyphs,
            glyphIndices: currentGlyphIndices, positions: currentPositions, stringIndices: currentStringIndices });
    };
    for (let visualIndex = 0; visualIndex < indices.length; visualIndex++) {
        const { run, glyphIndex } = getRunItemAtIndex(line.runs, indices[visualIndex]);
        if (run !== currentRun) {
            flushRun(visualIndex); currentRun = run; currentStart = visualIndex;
            currentGlyphs = []; currentGlyphIndices = []; currentPositions = []; currentStringIndices = []; clusters = new Map();
        }
        let reordered = clusters.get(glyphIndex);
        if (reordered === undefined) {
            reordered = currentGlyphs.length; clusters.set(glyphIndex,reordered);
            currentGlyphs.push(run.glyphs[glyphIndex]); currentGlyphIndices.push(visualIndex - currentStart);
            currentPositions.push(run.positions[glyphIndex]);
        }
        currentStringIndices.push(reordered);
    }
    flushRun(indices.length);
`;
source=source.slice(0,lookupStart)+lookup+source.slice(lookupEnd,runsStart)+rebuild+source.slice(runsEnd);
fs.writeFileSync(file,source);
process.stdout.write('Applied Arabic PDF cluster fix to textkit '+version+'\n');
