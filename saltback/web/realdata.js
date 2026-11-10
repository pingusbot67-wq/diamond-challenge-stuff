/* Real, published road-salt use. Totals as reported by each agency (or by a local news/public-health report that
   quotes them). lb per lane-mile per winter = tons x 2000 / lane-miles. Tonnes converted to US tons x 1.1023.
   Lane-miles: MassDOT 16,000 (MassDOT research newsletter 2022 Q4); MnDOT from its winter reports; Toronto
   14,700 lane-km = 9,134 lane-miles (city fact sheet). Madison reports route miles, not lane-miles. */
window.SaltbackReal = [
  { who: 'MassDOT (state highways)', place: 'boston', season: '2017–18', tons: 455447, laneMiles: 16000, src: 'https://eeaonline.eea.state.ma.us/EEA/emepa/mepadocs/2020/122320em/pn/MassDOT%20Snow%20%20Ice%20Program%202019-20%20Annual%20Report-Final.pdf' },
  { who: 'MassDOT (state highways)', place: 'boston', season: '2018–19', tons: 401092, laneMiles: 16000, src: 'https://eeaonline.eea.state.ma.us/EEA/emepa/mepadocs/2020/122320em/pn/MassDOT%20Snow%20%20Ice%20Program%202019-20%20Annual%20Report-Final.pdf' },
  { who: 'MassDOT (state highways)', place: 'boston', season: '2019–20 (mild)', tons: 287332, laneMiles: 16000, src: 'https://eeaonline.eea.state.ma.us/EEA/emepa/mepadocs/2020/122320em/pn/MassDOT%20Snow%20%20Ice%20Program%202019-20%20Annual%20Report-Final.pdf' },
  { who: 'MassDOT (state highways)', place: 'boston', season: '20-year average', tons: 485861, laneMiles: 16000, src: 'https://eeaonline.eea.state.ma.us/EEA/emepa/mepadocs/2020/122320em/pn/MassDOT%20Snow%20%20Ice%20Program%202019-20%20Annual%20Report-Final.pdf' },
  { who: 'MnDOT (state highways)', place: 'minneapolis', season: '2017–18', tons: 251418, laneMiles: 30341, src: 'https://www.dot.mn.gov/maintenance/winter-report.html' },
  { who: 'MnDOT (state highways)', place: 'minneapolis', season: '2019–20', tons: 210045, laneMiles: 30341, src: 'https://www.dot.state.mn.us/maintenance/pdf/2020-winter-maintenance-report.pdf' },
  { who: 'MnDOT (state highways)', place: 'minneapolis', season: '2023–24', tons: 114155, laneMiles: 30309, src: 'https://www.dot.mn.gov/maintenance/winter-report.html' },
  { who: 'MnDOT (state highways)', place: 'minneapolis', season: '2024–25', tons: 141489, laneMiles: 30304, src: 'https://www.dot.mn.gov/maintenance/winter-report.html' },
  { who: 'City of Toronto (all city roads)', place: 'burlington', season: '10-year average', tons: Math.round(146275 * 1.1023), laneMiles: 9134, src: 'https://www.toronto.ca/news/city-of-toronto-winter-road-operations/' },
  { who: 'City of Madison, WI', place: 'chicago', season: '2012–13', tons: 16351, laneMiles: null, routeMiles: 778, src: 'https://publichealthmdc.com/documents/Road_Salt_Report_2022.pdf' },
  { who: 'City of Madison, WI', place: 'chicago', season: '2021–22', tons: 6124, laneMiles: null, routeMiles: 778, src: 'https://publichealthmdc.com/documents/Road_Salt_Report_2022.pdf' },
];
