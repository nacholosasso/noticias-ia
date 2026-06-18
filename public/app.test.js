const test = require('node:test');
const assert = require('node:assert/strict');
const { formatTimeAgo, getCategoryClass } = require('./app.js');

test('getCategoryClass normaliza tildes y mayúsculas', () => {
    assert.equal(getCategoryClass('Política'), 'cat-politica');
    assert.equal(getCategoryClass('ECONOMIA'), 'cat-economia');
});

test('getCategoryClass devuelve cat-general para categorías desconocidas o vacías', () => {
    assert.equal(getCategoryClass('Clima'), 'cat-general');
    assert.equal(getCategoryClass(null), 'cat-general');
    assert.equal(getCategoryClass(undefined), 'cat-general');
});

test('formatTimeAgo muestra minutos para diferencias menores a una hora', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    assert.equal(formatTimeAgo(fiveMinutesAgo), 'Hace 5 min');
});

test('formatTimeAgo muestra horas para diferencias menores a un día', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    assert.equal(formatTimeAgo(threeHoursAgo), 'Hace 3 h');
});

test('formatTimeAgo soporta objetos Firestore Timestamp con .toDate()', () => {
    const fakeTimestamp = { toDate: () => new Date(Date.now() - 10 * 60 * 1000) };
    assert.equal(formatTimeAgo(fakeTimestamp), 'Hace 10 min');
});

test('formatTimeAgo devuelve string vacío si no hay fecha', () => {
    assert.equal(formatTimeAgo(null), '');
});
