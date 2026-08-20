/* <reserva-map> — Leaflet map of Asunción with business pins. Requires Leaflet loaded globally. */
(function(){
const PINS=[
 {id:'cab',name:'La Cabaña',lat:-25.2967,lng:-57.5762},
 {id:'lupe',name:'Lupe Café',lat:-25.2839,lng:-57.5671},
 {id:'prado',name:'Barbería El Prado',lat:-25.2864,lng:-57.6369},
 {id:'aqua',name:'Aqua Spa & Wellness',lat:-25.3052,lng:-57.5858}
];
class ReservaMap extends HTMLElement{
  connectedCallback(){
    if(this._built)return;this._built=true;
    this.style.cssText+=';display:block;width:100%;height:100%';
    const div=document.createElement('div');
    div.style.cssText='width:100%;height:100%';
    this.appendChild(div);
    const ensure=()=>{ if(window.L&&window.L.map){this._build(div);} else setTimeout(ensure,100); };
    ensure();
  }
  _build(div){
    const filter=(this.getAttribute('only')||'').split(',').filter(Boolean);
    const pins=filter.length?PINS.filter(p=>filter.includes(p.id)):PINS;
    const map=L.map(div,{scrollWheelZoom:true}).setView([-25.292,-57.60],13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(map);
    pins.forEach(p=>{
      const icon=L.divIcon({className:'',iconSize:null,html:
        '<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;cursor:pointer">'+
        '<div style="background:#D98E73;color:#fff;font:700 11px Figtree,system-ui,sans-serif;border-radius:999px;padding:4px 10px;white-space:nowrap;box-shadow:0 4px 10px rgba(169,103,76,.45)">'+p.name+'</div>'+
        '<div style="width:9px;height:9px;background:#A9674C;border:2px solid #fff;border-radius:50%;margin-top:2px;box-shadow:0 2px 5px rgba(0,0,0,.3)"></div></div>'});
      L.marker([p.lat,p.lng],{icon}).addTo(map).on('click',()=>{
        window.dispatchEvent(new CustomEvent('reserva-map-pin',{detail:p.id}));
      });
    });
    setTimeout(()=>map.invalidateSize(),250);
  }
}
if(!customElements.get('reserva-map'))customElements.define('reserva-map',ReservaMap);
})();
