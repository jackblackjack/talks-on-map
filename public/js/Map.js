/* globals L */
let EventEmitter = require('eventemitter3');

class Map extends EventEmitter {
    constructor(cityName) {
        super();
        this._checkZoomRange = false;
        this._statesControl = {
            showAccidents: true,
            showHeatMap: true
        };
        this.cityName = cityName;
        this.init((map, heatmap, markers, accidents) => {
            this.map = map;
            this.heatmap = heatmap;
            this.markers = markers;
            this.accidents = accidents;
        });
    }

    init(callback) {
        callback = callback || function () {};

        let map, heatmap, markers, accidents;
        L.Icon.Default.imagePath = 'vendor/image';
        map = L.map('map', {
                attributionControl: false,
                minZoom: 10,
                maxZoom: 15
            })
            .setView([0, 0]);
        L.tileLayer('http://tiles.maps.sputnik.ru/tiles/{z}/{x}/{y}.png').addTo(map);
        heatmap = L.heatLayer([], {
            // minOpacity: 0.3,
            max: 0.2,
            // radius: 20,
            // blur: 10,
            gradient: {
                0.1: 'blue',
                0.2: 'lime',
                1.0: 'red'
            }
        }).addTo(map);
        markers = new L.FeatureGroup();
        map.addLayer(markers);
        accidents = new L.FeatureGroup();
        map.addLayer(accidents);
        map.whenReady(callback.bind(this, map, heatmap, markers, accidents));
        L.easyButton('glyphicon-bell', this.showAccidentsToggle.bind(this), '', map);
        L.easyButton('glyphicon-flag', this.showHeatMapToggle.bind(this), '', map);

    }

    setStatesControl(states) {
        this._statesControl = states || this._statesControl;
        this.showHeatMapToggle(!this._statesControl.showHeatMap);
        this.showAccidentsToggle(!this._statesControl.showAccidents);
    }

    getStatesControl() {
        return this._statesControl;
    }

    showHeatMapToggle(visible) {
        let canvas = this.heatmap._canvas;
        if (visible === undefined) {
            visible = canvas.style.display !== 'none';
        }
        if (visible) {
            canvas.style.display = 'none';
        } else {
            canvas.style.display = '';
        }
        this._statesControl.showHeatMap = canvas.style.display !== 'none';
        this.emit('controls:change', this.getStatesControl());
    }

    showAccidentsToggle(visible) {
        if (visible === undefined) {
            visible = this.map.hasLayer(this.accidents);
        }
        if (visible) {
            this.map.removeLayer(this.accidents);
        } else {
            this.map.addLayer(this.accidents);
        }
        this._statesControl.showAccidents = this.map.hasLayer(this.accidents);
        this.emit('controls:change', this.getStatesControl());
    }

    setCity(value) {
        this.cityName = value;
        this._checkZoomRange = false;
    }

    setMarker(coord) {
        let marker = L.marker([coord.lat, coord.lot]);
        this.markers.addLayer(marker);
    }

    unsetMarker() {
        this.markers.clearLayers();
    }

    addAccidentMarker(point) {
        let icon = L.icon({
            iconUrl: 'vendor/image/notice_dtp.png',
            iconRetinaUrl: 'vendor/image/notice_dtp.png',
            iconSize: [32, 32]
        });
        let accident = L.marker([point.coords.lat, point.coords.lon], {
            icon: icon
        });
        this.accidents.addLayer(accident);
    }

    distance(lat1, lon1, lat2, lon2) {
        let R = 6371,
            p = Math.PI / 180;
        let a = 0.5 - Math.cos((lat2 - lat1) * p) / 2 +
            Math.cos(lat1 * p) * Math.cos(lat2 * p) *
            (1 - Math.cos((lon2 - lon1) * p)) / 2;
        return R * 2 * Math.asin(Math.sqrt(a));
    }

    findClusterWithNearPoint(clusters, coord) {
        let i = 0;
        if (!clusters.length) {
            return 0;
        }
        for (; i < clusters.length; i++) {
            let cluster = clusters[i];
            if (cluster) {
                for (let j = 0; j < cluster.length; j++) {
                    let point = cluster[j],
                        dist = this.distance(point.lat, point.lon, coord.lat, coord.lon);
                    if (dist < 1) {
                        return i;
                    }
                }
            } else {
                return 0;
            }
        }
        return i;
    }

    prepareMessages(preparedMessages) {
        let clusters = [];

        for (let i = 0; i < preparedMessages.length; i++) {
            let coord = preparedMessages[i],
                currentCluster = this.findClusterWithNearPoint(clusters, coord);
            if (!clusters[currentCluster]) {
                clusters[currentCluster] = [];
            }
            clusters[currentCluster].push(coord);
        }

        for (let i = 0; i < clusters.length; i++) {
            clusters[i].sort((a, b) => {
                a = a.time;
                b = b.time;
                if (a < b) {
                    return -1;
                } else if (a > b) {
                    return 1;
                } else {
                    return 0;
                }
            });
        }

        return clusters;
    }

    prepare(data, callback) {
        callback = callback || function () {};

        this.accidents.clearLayers();
        let messages = data.messages,
            city = data.city,
            addressMessages = [],
            preparedMessages = [],
            countAccident = 0;

        for (let i = 0; i < messages.length; i++) {
            let point = messages[i];
            preparedMessages[i] = {
                text: point.text,
                time: point.time,
                lat: point.coords.lat,
                lon: point.coords.lon
            };
            if (point.type === 0) {
                countAccident += 1;
                this.addAccidentMarker(point);
            }
            addressMessages.push([point.coords.lat, point.coords.lon]);
        }

        if (!this._checkZoomRange && city.name === this.cityName) {
            this.map.fitBounds([
                [city.coords.tl_lat, city.coords.tl_lon],
                [city.coords.br_lat, city.coords.br_lon]
            ]);
            this._checkZoomRange = true;
        }

        this.heatmap.setLatLngs(addressMessages);
        return callback(this.prepareMessages(preparedMessages), countAccident);
    }
}

export default Map;