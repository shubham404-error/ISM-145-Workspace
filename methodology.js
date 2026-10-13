(function(root){
'use strict';
// Source: Methodology Links.xlsx supplied by the workspace owner.
const industries={
  "Education & Training Services": "https://mswiki.morningstar.com/spaces/ECM/pages/1467721091/Education+Training+Services",
  "Farm Products": "https://mswiki.morningstar.com/spaces/ECM/pages/1472511337/Farm+Products",
  "Food Distribution": "https://mswiki.morningstar.com/spaces/ECM/pages/1587809834/Food+Distribution",
  "Household & Personal Products": "https://mswiki.morningstar.com/spaces/ECM/pages/1577953526/Household+Personal+Products",
  "Engineering & Construction": "https://pitchbook.atlassian.net/wiki/spaces/PBECM/pages/3522592870/Engineering+Construction",
  "Farm & Heavy Construction Machinery": "https://pitchbook.atlassian.net/wiki/spaces/PBECM/pages/3522592999/Farm+Heavy+Construction+Machinery",
  "Tools & Accessories": "https://pitchbook.atlassian.net/wiki/spaces/PBECM/pages/3522593134/Tools+Accessories",
  "Waste Management": "https://pitchbook.atlassian.net/wiki/spaces/PBECM/pages/3522593097/Waste+Management",
  "Furnishings Fixtures & Appliances": "https://pitchbook.atlassian.net/wiki/spaces/PBECM/pages/3522592806/Furnishings+Fixtures+Appliances",
  "Integrated Freight & Logistics": "https://pitchbook.atlassian.net/wiki/spaces/PBECM/pages/3522592860/Integrated+Freight+Logistics",
  "Electronic Gaming & Multimedia": "https://pitchbook.atlassian.net/wiki/spaces/PBECM/pages/3522592966/Electronic+Gaming+Multimedia",
  "Entertainment": "https://pitchbook.atlassian.net/wiki/spaces/PBECM/pages/3522593005/Entertainment",
  "Publishing": "https://pitchbook.atlassian.net/wiki/spaces/PBECM/pages/3522593232/Publishing",
  "Communication Equipment": "https://pitchbook.atlassian.net/wiki/spaces/PBECM/pages/3522592961/Communication+Equipment",
  "Computer Hardware": "https://pitchbook.atlassian.net/wiki/spaces/PBECM/pages/3522593150/Computer+Hardware",
  "Consumer Electronics": "https://pitchbook.atlassian.net/wiki/spaces/PBECM/pages/3522593087/Consumer+Electronics",
  "Scientific & Technical Instruments": "https://pitchbook.atlassian.net/wiki/spaces/PBECM/pages/3522593203/Scientific+Technical+Instruments"
};
const fallback="https://pitchbook.atlassian.net/wiki/spaces/PBECM/pages/3522592894/Table+Of+Contents+-+ISM+145";
const guides={segment:"https://pitchbook.atlassian.net/wiki/spaces/PBECM/pages/3522592864/Segment+data+collection+methodology",unit:"https://pitchbook.atlassian.net/wiki/spaces/PBECM/pages/3522597130/Standard+Unit+Format"};
const key=value=>String(value||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
const lookup=new Map(Object.entries(industries).map(([name,url])=>[key(name),url]));
function industryUrl(name){return lookup.get(key(name))||fallback}
const api={industries,guides,fallback,industryUrl};
if(typeof module!=='undefined')module.exports=api;else root.ISM_METHODOLOGY=api;
})(typeof window==='undefined'?globalThis:window);
