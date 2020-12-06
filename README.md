# Motiu
OSM Lit Map neix després de veure dues convocatòries per part de grups socials destinades a informar sobre punts foscos i perillosos.
Aprofitant la base de dades d'Openstreetmap es combinen dos programaris.

# 0-La Base de dades: Openstreetmap
OSM (Openstreetmap) no és un mapa, és una base de dades de punts i línies geolocalitzats, que entre d'altres coses es pot aprofitar per fer mapes (renderitzacions). Però també es poden aprofitar les dades (en aquest cas, d'enllumenat) .Tot plegat es fa amb claus, valors i relacions en aquests punts i línies.
En aquest cas ens fixem en les claus

* lit (enllumenat)
* lit:perceived (percepció d'il·luminació)

# 1-Mapa
Mapa basat en [Bicycle tags map](https://wiki.openstreetmap.org/wiki/Bicycle_tags_map)

Amb modificacions de [Ramiro Balado](https://github.com/Qjammer)

Versió nova Openlayers feta per [Ripollx](https://github.com/Ripollx)

El mapa ens permet la mostra d'elements determinats personalitzables tenint com a fons varis mapes diferents.

Directament es pot modificar la página editant els arxius corresponents:

*    index.html conté l'esquelet de la página.
*    index.js conté l'orquestador per utilitzar OpenLayers (només es requereix modificar per afegir noves funcionalitats).
*    config.js conté la definició de les capes, idioma i característiques que es volen mostrar.

# 2-Mapcomplete

Utilitzem un repte personalitzat de [Mapcomplete](https://github.com/pietervdvn/MapComplete) per tal d'aportar les dades que faltin, fer en idioma "natural" (no de la màquina ni d'Openstreetmap) i poder-ho fer des de qualsevol dispositiu amb l'únic requisit de registrar-se com a usuari/a d'OpenStreetMap.

# [Exemple](http://yopaseopor.github.io/osmlitmap)

# Agraïments
A la Comunitat Catalana de Telegram per estar a l'aguaït d'iniciatives solidàries com les del Grup de Dones de Llefià, Geochicas o Urbanisme Feminista

