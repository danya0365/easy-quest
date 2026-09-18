/**
 * int_chapel.chests.js — what a child finds in the chapel.       (P06 seed; P30 owns treasure/ceremony from here)
 */
export default {
  chests: [
    { id: 'ch_pew1', x: -2.15, z: 1.4, kind: 'pew', name: 'under the back pew', line: 'search-pew', reach: 1.6 },
    { id: 'ch_font', x: -3.4, z: 2.8, kind: 'font', name: 'the font', line: 'search-font', reach: 1.6 },
    { id: 'ch_vestry', x: 4.6, z: -1.9, kind: 'crate', name: 'the vestry chest', line: 'search-vestry', reach: 1.6 },
    { id: 'ch_books', x: 2.15, z: 0.1, kind: 'shelf', name: 'the hymn books', line: 'search-books', reach: 1.6 },
  ],
  lines: {
    'search-pew': ['%HERO% gets down and looks under\nthe back pew.{wait:400}{n}A button, a boiled sweet of\nuncertain age, and {gold}3 gold coins{/gold}.',
      'Somebody has been dropping\nthings here for two hundred\nyears.'],
    'search-font': ['%HERO% looks into the font.{n}Cold water, and his own face\nlooking back looking worried.',
      'He makes a face. The face makes\nit back. Honours even.'],
    'search-vestry': ['%HERO% opens the vestry chest.{n}Candles, a spare rope, and a\nvery small pair of shoes nobody\nhas claimed.',
      'They are labelled ALDEN, which\ncannot be right.'],
    'search-books': ['%HERO% goes through the hymn\nbooks.{n}Number 14 has a beetle in it.\nNumber 14 is about patience.',
      'That seems fair to everybody\ninvolved.'],
    search: ['%HERO% looks along a pew.{n}A hymn book, three hymn books,\nand a hymn book with a beetle\nin it.',
      '%HERO% listens.{wait:500}{n}Nothing. That is what it is for.'],
  },
};
