import type { ArcadeGameId } from './game-metadata.js';

/** Small vector board illustrations, not captured scores or player activity. */
export function gamePreview(game: ArcadeGameId): string {
  const mint = '#54e38e', coral = '#ff6b78', gold = '#ffc857', blue = '#68dfff';
  const rect = (x: number, y: number, w: number, h: number, fill: string, radius = 2): string => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}"/>`;
  const circle = (x: number, y: number, radius: number, fill: string): string => `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}"/>`;
  const text = (x: number, y: number, value: string, fill = '#e7f4ff', size = 11): string => `<text x="${x}" y="${y}" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="${size}" fill="${fill}">${value}</text>`;
  let board = '';
  switch (game) {
    case 'bomberman':
      for (let y = 0; y < 9; y++) for (let x = 0; x < 13; x++) {
        board += rect(21 + x * 9, 9 + y * 9, 8, 8, x % 2 === 0 && y % 2 === 0 ? '#43556b' : (x * 3 + y * 7) % 5 === 0 ? '#97733d' : '#23392e', 1);
      }
      board += circle(34, 23, 4, mint) + circle(125, 77, 4, coral) + circle(61, 49, 4, '#0a1019') + circle(63, 45, 2, gold); break;
    case 'tintar':
      board = '<g fill="none" stroke="#70829a" stroke-width="2"><rect x="36" y="9" width="82" height="82"/><rect x="49" y="22" width="56" height="56"/><rect x="63" y="36" width="28" height="28"/><path d="M77 9v27m0 28v27M36 50h27m28 0h27"/></g>';
      board += circle(36,9,5,mint)+circle(77,9,5,mint)+circle(105,22,5,coral)+circle(118,91,5,coral)+circle(49,50,5,mint); break;
    case 'paddle':
      board = '<path d="M80 8v84" stroke="#43556b" stroke-width="2" stroke-dasharray="5 5"/>' + rect(24,29,6,29,mint) + rect(130,50,6,29,coral) + circle(89,37,4,'#ffffff') + '<path d="M77 44l-15 8" stroke="#68dfff" stroke-width="2"/>'; break;
    case 'snake':
      board = '<path d="M27 71h42V30h29v23" fill="none" stroke="#54e38e" stroke-width="9" stroke-linejoin="round"/>' + circle(126,66,5,coral) + circle(97,55,5,mint) + circle(95,55,1,'#081a12'); break;
    case 'tanks':
      board = rect(45,21,17,30,'#6d7584') + rect(90,53,30,12,'#c8914e') + rect(45,72,13,13,'#c8914e') + rect(24,55,17,13,mint) + rect(118,23,17,13,coral) + rect(38,60,13,3,mint) + rect(110,28,13,3,coral) + circle(78,33,3,gold); break;
    case 'racing':
      board = '<ellipse cx="80" cy="50" rx="63" ry="35" fill="#414b60" stroke="#c8d3e5" stroke-width="2"/><ellipse cx="80" cy="50" rx="31" ry="15" fill="#163d2d"/><ellipse cx="80" cy="50" rx="46" ry="25" fill="none" stroke="#91a1b8" stroke-dasharray="5 5"/>' + rect(74,73,12,6,mint) + rect(111,25,12,6,coral) + text(35,41,'ϟ',gold,14); break;
    case 'blocks':
      board = rect(31,8,58,84,'#0a1823') + rect(108,23,27,53,'#201821');
      for (let y=0;y<4;y++) for(let x=0;x<6-y;x++) board += rect(33+x*9,82-y*9,8,8,[mint,gold,blue][y%3]);
      board += rect(51,22,8,8,blue)+rect(42,31,26,8,blue)+rect(111,61,21,12,coral); break;
    case 'twenty48':
      for (let y=0;y<4;y++) for(let x=0;x<4;x++) {
        const value = [2,4,8,16][(x+y)%4]; board += rect(36+x*22,7+y*22,20,20,[ '#274151','#536044','#947039','#bf843a'][(x+y)%4],3);
        if ((x+y)%3) board += text(46+x*22,21+y*22,String(value),'#fff2d5',9);
      } break;
    case 'sudoku':
      board = rect(38,8,81,81,'#172b3c');
      for(let i=0;i<=9;i++) board += `<path d="M${38+i*9} 8v81M38 ${8+i*9}h81" stroke="${i%3 ? '#33495a':'#9dcbd6'}" stroke-width="${i%3 ? .5:1.5}"/>`;
      for(let i=0;i<20;i++) board += text(42.5+(i*7%9)*9,15+(i*4%9)*9,String(i%9+1),'#d8f2f7',7); break;
    case 'septica':
      for(let i=0;i<4;i++) board += rect(31+i*23,25+i%2*6,32,51,'#f4eedc',4)+text(47+i*23,43+i%2*6,['7','A','10','7'][i],i%2 ? '#d45059':'#18212b',12)+text(47+i*23,62+i%2*6,i%2?'♥':'♠',i%2?'#d45059':'#18212b',15); break;
    case 'survival':
      board = '<g fill="none" stroke="#304155"><circle cx="80" cy="50" r="18"/><circle cx="80" cy="50" r="37"/></g>'+circle(80,50,8,mint);
      for(let i=0;i<7;i++) board += circle(28+(i*23)%108,17+(i*19)%64,4,'#ba8aff');
      board += circle(68,40,2,gold)+circle(58,30,2,gold); break;
    case 'star':
      for(let y=0;y<3;y++) for(let x=0;x<5;x++) board+=rect(32+x*22,15+y*15,12,7,y===0?coral:blue);
      board+='<path d="M80 68l-10 19h20z" fill="#54e38e"/>'+rect(79,56,2,7,gold)+rect(79,40,2,7,gold); break;
  }
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><rect width="160" height="100" rx="10" fill="#101d2b"/>${board}</svg>`)}`;
}
