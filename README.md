# GéoCliché

Appareil photo de chantier pour iPhone (PWA) : chaque photo est nommée, annotée et positionnée en Lambert 93 ou CC49, puis exportée en CSV, ZIP, projet QGIS, KMZ, DXF, semis de points ou carte HTML avec rapport PDF.

## Mise en ligne
La caméra et le GPS n'acceptent qu'une page servie en https.
- Netlify : glisser le dossier `geocliche` sur https://app.netlify.com/drop
- GitHub Pages : déposer le contenu du dossier dans un dépôt, puis Settings, Pages.

## Installation sur iPhone
Ouvrir l'adresse dans Safari, autoriser la caméra et la position, puis Partager, « Sur l'écran d'accueil ».
Pour enregistrer le cap, toucher « Cap activer » dans le panneau jaune (iOS demande l'accès à l'orientation).

## Mise à jour
Après toute modification, changer `VERSION` dans `sw.js`, sinon les téléphones gardent l'ancienne version en cache.

## Fichiers
- `index.html`, `css/app.css` : interface
- `js/app.js` : écrans, GPS, prise de vue, galerie, carte, exports
- `js/geo.js` : projections L93 / CC49, adresse (Géoplateforme IGN puis BAN), cap
- `js/camera.js`, `js/photo.js`, `js/annot.js` : caméra, bandeau incrusté, annotation
- `js/exif.js` : EXIF (GPS, date, cap, précision, commentaire)
- `js/db.js` : stockage local (IndexedDB)
- `js/zip.js`, `js/exports.js`, `js/qgis.js`, `js/report.js` : exports
- `lib/` : Leaflet 1.9.4 et proj4 2.15 en copie locale (hors connexion)

## Limites
- Position du GPS du téléphone : précision métrique. L'altitude n'est pas rattachée au NGF.
- La définition est celle du flux vidéo de Safari, souvent inférieure à l'appareil photo natif. Le bouton « Utiliser l'appareil photo » (si la caméra est refusée) passe par l'appareil natif.
- Fonds de carte et adresses demandent du réseau ; le reste fonctionne hors connexion.
- Safari peut effacer les données d'un site non installé après 7 jours sans visite : installer l'appli et exporter régulièrement.
