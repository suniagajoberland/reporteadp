/**
 * Registro Diario de Personal EEP - Google Apps Script
 *
 * Reemplaza al script que esta en produccion. Se mantiene igual el formato de
 * la respuesta (reports + workers) y se agrega "personal", que trae el nombre
 * junto con turno, cargo y sucursal de la pestaña Personal.
 *
 * Que cambia respecto al script anterior:
 *   - doGet devuelve tambien "personal" con los datos completos de la hoja.
 *   - doPost escribe nombre, turno, cargo y sucursal en la hoja Personal, asi
 *     el formulario puede filtrar el personal por sucursal.
 *   - La comparacion de nombres ignora tildes, mayusculas y espacios de mas,
 *     para que "Jose Perez" y "josé  pérez" no entren como dos personas.
 *   - Se fija un bloqueo breve mientras se escribe, para que dos envios al
 *     tiempo no agreguen el mismo nombre dos veces.
 *   - Los reportes se guardan por MES: cada mes tiene su propia pestana
 *     (2026-10, 2026-11, ...) que se crea sola la primera vez que se usa.
 *
 * Importante:
 *   - La hoja Personal se busca por nombre y, si no existe, se crea sola.
 *   - Los encabezados de la hoja se leen por texto, asi que el orden de las
 *     columnas no importa (recomendado: Nombre | Turno | Cargo | Sucursal).
 *   - doGet sigue leyendo la primera pestana, por si quedaron reportes viejos
 *     ahi antes del almacenamiento mensual.
 */

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lock = LockService.getScriptLock();
  var bloqueado = false;

  try {
    lock.waitLock(20000);
    bloqueado = true;

    var data = JSON.parse(e.postData.contents);

    // 1. Guardar el reporte de asistencia en la pestana del mes que corresponde
    var fecha = fechaISO(data.date) || fechaISO(new Date());
    var sheetReportes = getHojaMes(ss, fecha);

    sheetReportes.appendRow([
      fecha,
      limpiarTexto(data.storeName),
      limpiarTexto(data.fullName),
      limpiarTexto(data.workerShift),
      limpiarTexto(data.workerRole),
      limpiarTexto(data.attendanceStatus)
    ]);

    // 2. Guardar los datos del trabajador en la pestaña "Personal"
    var detalle = guardarEnPersonal(ss, data);

    return ContentService.createTextOutput(JSON.stringify({
      "result": "success",
      "personal": detalle
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ "result": "error", "message": error.toString() }))
           .setMimeType(ContentService.MimeType.JSON);

  } finally {
    if (bloqueado) lock.releaseLock();
  }
}

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Obtener reportes de asistencia (pestañas mensuales + primera antigua)
  var reportsData = leerReportes(ss);

  // Obtener lista acumulada de trabajadores (Pestaña "Personal")
  var sheetPersonal = getHojaPersonal(ss, false);
  var personalData = [];
  var workersList = [];

  if (sheetPersonal) {
    var columns = leerColumnas(sheetPersonal);
    var rowsPers = sheetPersonal.getDataRange().getValues();

    for (var j = 1; j < rowsPers.length; j++) {
      var fila = rowsPers[j];
      var nombre = String(fila[columns.nombre] === undefined ? "" : fila[columns.nombre]).trim();

      if (nombre === "") continue;

      personalData.push({
        nombre: nombre,
        turno: normalizarTurno(fila[columns.turno]),
        cargo: normalizarCargo(fila[columns.cargo]),
        sucursal: normalizarTexto(fila[columns.sucursal])
      });
      workersList.push(nombre);
    }

    // Ordenar alfabéticamente la lista para que se vea más organizada
    personalData.sort(function (a, b) {
      return a.nombre.localeCompare(b.nombre, "es");
    });
    workersList.sort();
  }

  var responseObj = {
    reports: reportsData,
    personal: personalData,
    workers: workersList
  };

  return ContentService.createTextOutput(JSON.stringify(responseObj))
         .setMimeType(ContentService.MimeType.JSON);
}

// Lee todos los reportes guardados: las pestanas mensuales (2026-10, 2026-11...)
// y, por si quedaron reportes viejos, la primera pestana del libro.
function leerReportes(ss) {
  var hojas = ss.getSheets();
  var salida = [];

  for (var i = 0; i < hojas.length; i++) {
    var hoja = hojas[i];
    var nombre = hoja.getName();

    if (normalizarTexto(nombre) === "personal") continue;

    var esMes = esHojaMes(nombre);
    if (!esMes && i !== 0) continue;

    var filas = hoja.getDataRange().getValues();

    for (var f = 1; f < filas.length; f++) {
      var fila = filas[f];
      var fecha = fechaISO(fila[0]);
      if (fecha === "") continue;

      salida.push({
        date: fecha,
        storeName: String(fila[1] === undefined ? "" : fila[1]).trim(),
        fullName: String(fila[2] === undefined ? "" : fila[2]).trim(),
        workerShift: String(fila[3] === undefined ? "" : fila[3]).trim().toUpperCase(),
        workerRole: String(fila[4] === undefined ? "" : fila[4]).trim(),
        attendanceStatus: String(fila[5] === undefined ? "" : fila[5]).trim()
      });
    }
  }

  return salida;
}

// Una pestana mensual tiene el nombre del mes en formato AAAA-MM: "2026-10".
function esHojaMes(nombre) {
  return /^\d{4}-\d{2}$/.test(String(nombre === null || nombre === undefined ? "" : nombre).trim());
}

function nombreMes(fecha) {
  var iso = fechaISO(fecha);
  if (iso === "") iso = fechaISO(new Date());
  return iso.substring(0, 7);
}

// Devuelve la pestana del mes, creandola sola (con encabezados) la primera vez.
function getHojaMes(ss, fecha) {
  var nombre = nombreMes(fecha);
  var hojas = ss.getSheets();

  for (var i = 0; i < hojas.length; i++) {
    if (normalizarTexto(hojas[i].getName()) === normalizarTexto(nombre)) {
      return hojas[i];
    }
  }

  var hoja = ss.insertSheet(nombre);
  hoja.getRange(1, 1, 1, 6)
    .setValues([["Fecha", "Sucursal", "Nombre", "Turno", "Cargo", "Actividad"]])
    .setFontWeight("bold");
  hoja.setFrozenRows(1);

  return hoja;
}

// Da de alta al trabajador en la pestaña Personal y guarda sus datos. Si ya
// existe solo completa las celdas vacias (turno, cargo y sucursal), de modo que
// nadie se agrega dos veces ni pierde lo que ya estaba escrito a mano.
function guardarEnPersonal(ss, data) {
  var sheet = getHojaPersonal(ss, true);
  var columns = leerColumnas(sheet);
  var nombre = limpiarTexto(data.fullName);

  if (nombre === "") {
    return { accion: "sin nombre", nombre: "" };
  }

  var clave = normalizarTexto(nombre);
  var lastRow = sheet.getLastRow();
  var fila = -1;

  // La fila 1 son los encabezados, se compara desde la 2
  if (lastRow >= 2) {
    var nombres = sheet.getRange(2, columns.nombre + 1, lastRow - 1, 1).getValues();

    for (var i = 0; i < nombres.length; i++) {
      if (normalizarTexto(nombres[i][0]) === clave) {
        fila = i + 2;
        break;
      }
    }
  }

  var datos = {};
  datos[columns.turno] = normalizarTurno(data.workerShift);
  datos[columns.cargo] = normalizarCargo(data.workerRole);
  datos[columns.sucursal] = limpiarTexto(data.storeName);

  if (fila > 0) {
    var completados = completarFila(sheet, fila, datos);
    return {
      accion: completados > 0 ? "actualizado" : "ya estaba",
      nombre: nombre,
      campos: completados
    };
  }

  // Persona nueva: se escribe la fila completa respetando el orden de columnas
  var ancho = Math.max(sheet.getLastColumn(), columns.sucursal + 1);
  var nueva = [];

  for (var c = 0; c < ancho; c++) nueva.push("");

  nueva[columns.nombre] = nombre;

  for (var indice in datos) {
    if (datos.hasOwnProperty(indice)) nueva[Number(indice)] = datos[indice];
  }

  sheet.appendRow(nueva);

  return { accion: "agregado", nombre: nombre, campos: 3 };
}

// Rellena las celdas vacias de una fila de Personal y devuelve cuantas cambio.
// Lo que ya tiene un valor (por ejemplo escrito a mano) se respeta intacto.
function completarFila(sheet, fila, datos) {
  var valores = sheet.getRange(fila, 1, 1, sheet.getLastColumn()).getValues()[0];
  var cambios = {};
  var cantidad = 0;

  for (var indice in datos) {
    if (!datos.hasOwnProperty(indice)) continue;

    var columna = Number(indice);
    var actual = valores[columna] === undefined ? "" : valores[columna];
    var nuevo = datos[indice];

    if (String(actual).trim() === "" && String(nuevo).trim() !== "") {
      cambios[columna] = nuevo;
      cantidad++;
    }
  }

  if (cantidad === 0) return 0;

  for (var columna in cambios) {
    if (cambios.hasOwnProperty(columna)) valores[Number(columna)] = cambios[columna];
  }

  sheet.getRange(fila, 1, 1, valores.length).setValues([valores]);

  return cantidad;
}

// La pestaña Personal se busca por nombre (ignora mayusculas y espacios). Si no
// existe y crear es true, se crea con los encabezados; si no, se devuelve null
// para nunca leer otra pestaña por error.
function getHojaPersonal(ss, crear) {
  var hojas = ss.getSheets();
  var encontrada = null;

  for (var i = 0; i < hojas.length; i++) {
    if (normalizarTexto(hojas[i].getName()) === "personal") {
      encontrada = hojas[i];
      break;
    }
  }

  if (!encontrada) {
    if (!crear) return null;
    encontrada = ss.insertSheet("Personal");
  }

  if (encontrada.getLastRow() === 0) {
    encontrada.getRange(1, 1, 1, 4)
      .setValues([["Nombre", "Turno", "Cargo", "Sucursal"]])
      .setFontWeight("bold");
  }

  return encontrada;
}

// Busca cada columna por su encabezado: si la hoja tiene "Nombre, Turno, Cargo,
// Sucursal" en ese orden funciona igual, y tambien si se reordenan. Si el
// encabezado no existe se usa el orden por defecto: A nombre, B turno, C cargo,
// D sucursal.
function leerColumnas(sheet) {
  var encabezados = ["nombre", "turno", "cargo", "sucursal"];
  var primeraFila = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var columnas = {};

  for (var h = 0; h < encabezados.length; h++) {
    var posicion = -1;

    for (var c = 0; c < primeraFila.length; c++) {
      if (normalizarEncabezado(primeraFila[c]) === encabezados[h]) {
        posicion = c;
        break;
      }
    }

    columnas[encabezados[h]] = posicion >= 0 ? posicion : h;
  }

  return columnas;
}

function normalizarEncabezado(valor) {
  return String(valor === null || valor === undefined ? "" : valor)
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

// Para comparar: sin tildes, sin mayúsculas y sin espacios de más
function normalizarTexto(valor) {
  return String(valor === null || valor === undefined ? "" : valor)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

// Para guardar en la celda: sin espacios de más
function limpiarTexto(valor) {
  return String(valor === null || valor === undefined ? "" : valor)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarTurno(valor) {
  var turno = String(valor === null || valor === undefined ? "" : valor).trim().toUpperCase();
  return (turno === "AM" || turno === "PM") ? turno : "";
}

function normalizarCargo(valor) {
  var cargo = normalizarTexto(valor);
  if (cargo === "supervisor") return "supervisor";
  return cargo === "" ? "" : "multifuncional";
}

// Convierte cualquier fecha (texto ISO, texto suelto o valor de celda) a
// "AAAA-MM-DD" usando la zona horaria del libro, para que el dia nunca se
// corra por la hora. Si no se entiende, devuelve cadena vacia.
function fechaISO(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, zonaHoraria(), "yyyy-MM-dd");
  }

  var texto = String(valor === null || valor === undefined ? "" : valor).trim();
  if (texto === "") return "";

  var iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];

  var fecha = new Date(texto);
  if (isNaN(fecha.getTime())) return "";

  return Utilities.formatDate(fecha, zonaHoraria(), "yyyy-MM-dd");
}

var ZONA_CACHE = null;

function zonaHoraria() {
  if (!ZONA_CACHE) {
    try {
      ZONA_CACHE = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    } catch (error) {
      ZONA_CACHE = Session.getScriptTimeZone();
    }
  }
  return ZONA_CACHE;
}