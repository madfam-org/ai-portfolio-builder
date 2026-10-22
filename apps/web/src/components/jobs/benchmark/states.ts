/**
 * ISO 3166-2:MX -> the state's name as INEGI's own `cve_ent` catalog writes it (Symbiosis HCM's
 * test_bundled_dataset.py checks the same table against that catalog). Display only.
 */
export const STATE_NAMES: Readonly<Record<string, string>> = {
  'MX-AGU': 'Aguascalientes', 'MX-BCN': 'Baja California', 'MX-BCS': 'Baja California Sur',
  'MX-CAM': 'Campeche', 'MX-COA': 'Coahuila', 'MX-COL': 'Colima', 'MX-CHP': 'Chiapas',
  'MX-CHH': 'Chihuahua', 'MX-CMX': 'Ciudad de México', 'MX-DUR': 'Durango', 'MX-GUA': 'Guanajuato',
  'MX-GRO': 'Guerrero', 'MX-HID': 'Hidalgo', 'MX-JAL': 'Jalisco', 'MX-MEX': 'México',
  'MX-MIC': 'Michoacán', 'MX-MOR': 'Morelos', 'MX-NAY': 'Nayarit', 'MX-NLE': 'Nuevo León',
  'MX-OAX': 'Oaxaca', 'MX-PUE': 'Puebla', 'MX-QUE': 'Querétaro', 'MX-ROO': 'Quintana Roo',
  'MX-SLP': 'San Luis Potosí', 'MX-SIN': 'Sinaloa', 'MX-SON': 'Sonora', 'MX-TAB': 'Tabasco',
  'MX-TAM': 'Tamaulipas', 'MX-TLA': 'Tlaxcala', 'MX-VER': 'Veracruz', 'MX-YUC': 'Yucatán',
  'MX-ZAC': 'Zacatecas',
};

export const stateName = (iso: string | null | undefined): string => (iso ? (STATE_NAMES[iso] ?? iso) : '');
