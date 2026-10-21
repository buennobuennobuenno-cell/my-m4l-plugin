/* Two narrow jsui panels for 32 limits, replacing 32 independent JS contexts.
   Each canvas is confined to numeric fields; it cannot cover a Map button.
   Redraws only after bounds change or Max requests a paint. ES5 / Max 8. */
autowatch=0;
inlets=1;
outlets=1;
mgraphics.init();mgraphics.relative_coords=0;mgraphics.autofill=0;
var values=[],unitLabels=[],bankIndex=0,drag=null,lastHit=null,hover="";
for (var n=0;n<16;n++) {values.push([0,100]);unitLabels.push(["",""]);}
function clip(x) {return Math.max(0,Math.min(100,x));}
function bank(index) {
    index=Number(index);
    if ((index!==0 && index!==1) || index===bankIndex) return;
    bankIndex=index;drag=null;lastHit=null;hover="";mgraphics.redraw();
}
function row(number,lo,hi) {
    var j=Number(number)-1;
    if (j<0 || j>=16 || j!==Math.floor(j) || !isFinite(lo) || !isFinite(hi)) return;
    lo=clip(Number(lo));hi=clip(Number(hi));
    if (values[j][0]===lo && values[j][1]===hi) return;
    values[j][0]=lo;values[j][1]=hi;mgraphics.redraw();
}
function units(number,lo,hi) {
    var j=Number(number)-1;
    if (j<0 || j>=16 || j!==Math.floor(j)) return;
    unitLabels[j]=[String(lo),String(hi)];
}
function hit(x,y) {
    if (!isFinite(x) || !isFinite(y) || x<0 || x>=118 || y<0 || y>=112) return null;
    var key=-1;
    if (x<56) key=0;
    else if (x>=62) key=1;
    if (key<0) return null;
    return {j:bankIndex*8+Math.floor(y/14),key:key};
}
function paint() {
    mgraphics.set_source_rgba(0.1,0.12,0.14,1);
    mgraphics.rectangle(0,0,118,112);mgraphics.fill();
    mgraphics.select_font_face("Arial");mgraphics.set_font_size(10);
    for (var rowIndex=0;rowIndex<8;rowIndex++) for (var key=0;key<2;key++) {
        var j=bankIndex*8+rowIndex,x=key?62:0,y=rowIndex*14;
        mgraphics.set_source_rgba(0.13,0.15,0.17,1);
        mgraphics.rectangle(x,y,56,14);mgraphics.fill();
        mgraphics.set_source_rgba(0.94,0.95,0.95,1);
        mgraphics.move_to(x+5,y+11);mgraphics.show_text(String(Math.round(values[j][key])));
    }
}
function onclick(x,y) {
    lastHit=hit(x,y);drag=null;
    if (!lastHit) return;
    outlet(0,"dismiss");
    drag={j:lastHit.j,key:lastHit.key,y:y,value:Math.round(values[lastHit.j][lastHit.key]),step:0};
}
function ondrag(x,y,button) {
    if (!button) {drag=null;return;}
    if (!drag || !isFinite(y)) return;
    var step=Math.round((drag.y-y)/2);
    if (step===drag.step) return;
    drag.step=step;
    var value=clip(drag.value+step);
    if (value===values[drag.j][drag.key]) return;
    // The controller owns precision, crossing limits and the saved state.
    // Its row() response updates this display; UI never keeps a second state.
    outlet(0,"setting",drag.j+1,drag.key?"hi":"lo",value);
}
function ondblclick(x,y) {
    var selected=isFinite(x)&&isFinite(y)?hit(x,y):lastHit;
    if (selected) outlet(0,"edit",selected.j+1,selected.key?"hi":"lo");
}
function onidle(x,y) {
    var selected=hit(x,y),label="Ziehen: ganze Prozentpunkte. Doppelklick: genaue Zahl eingeben.";
    if (selected) {
        var formatted=unitLabels[selected.j][selected.key];
        if (formatted) label=values[selected.j][selected.key]+"% = "+formatted+" | "+label;
    }
    if (label===hover) return;
    hover=label;
    try {box.message("hint",label);} catch (e) {}
}
