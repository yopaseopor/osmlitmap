/* global config, ol */
$(function () {
	$('#map').empty(); // Remove Javascript required message
	var baseLayerIndex = 0;

	//Object to manage the spinner layer
	var loading = {
		init: function () {
			this.count = 0;
			this.spinner = $('<div>').addClass('ol-control osmcat-loading').html('<i class="fa fa-spinner fa-pulse fa-3x fa-fw"></i>');
			$('#map').append(this.spinner);
		},
		show: function () {
			this.spinner.show();
			++this.count;
		},
		hide: function () {
			--this.count;
			if (this.count < 1) {
				this.spinner.hide();
				this.count = 0;
			}
		}
	};
	loading.init();

	var overlaysTemp = {};
	$.each(config.overlays, function (index, overlay) {
		var layerGroup = overlay['group'],
				vectorProperties = overlay,
				vector;

		if (overlay['geojson'] !== undefined) {
      var vectorSource = new ol.source.Vector({
        format: new ol.format.GeoJSON(),
        url: overlay['geojson']
      })
    } else {
			var vectorSource = new ol.source.Vector({ 
			format: new ol.format.OSMXML2(),
			loader: function (extent, resolution, projection) {
				loading.show();
				var me = this;
				var epsg4326Extent = ol.proj.transformExtent(extent, projection, 'EPSG:4326');
				var query = '[maxsize:536870912];' + overlay['query']; // Memory limit 512 MiB
				//var query = layerQuery;
				query = query.replace(/{{bbox}}/g, epsg4326Extent[1] + ',' + epsg4326Extent[0] + ',' + epsg4326Extent[3] + ',' + epsg4326Extent[2]);

				var client = new XMLHttpRequest();
				client.open('POST', config.overpassApi());
				client.onloadend = function () {
					loading.hide();
				};
				client.onerror = function () {
					console.error('[' + client.status + '] Error loading data.');
					me.removeLoadedExtent(extent);
					vector.setVisible(false);
				};
				client.onload = function () {
					if (client.status === 200) {
						var xmlDoc = $.parseXML(client.responseText),
								xml = $(xmlDoc),
								remark = xml.find('remark'),
								nodosLength = xml.find('node').length;

						if (remark.length !== 0) {
							console.error('Error:', remark.text());
							$('<div>').html(remark.text()).dialog({
								modal: true,
								title: 'Error',
								close: function () {
									$(this).dialog('destroy');
								}
							});
							client.onerror.call(this);
						} else {
							console.log('Nodes Found:', nodosLength);
							if (nodosLength === 0) {
								$('<div>').html(config.i18n.noNodesFound).dialog({
									modal: true,
									//title: 'Error',
									close: function () {
										$(this).dialog('destroy');
									}
								});
							}
							var features = new ol.format.OSMXML2().readFeatures(xmlDoc, {
								featureProjection: map.getView().getProjection()
							});
							me.addFeatures(features);
						}
					} else {
						client.onerror.call(this);
					}
				};
				client.send(query);
			},
			strategy: ol.loadingstrategy.bbox
		});
	}
		vectorProperties['source'] = vectorSource;
		vectorProperties['visible'] = false;

		vector = new ol.layer.Vector(vectorProperties);

		if (overlaysTemp[layerGroup] !== undefined) {
			overlaysTemp[layerGroup].push(vector);
		} else {
			overlaysTemp[layerGroup] = [vector];
		}
	});

	$.each(overlaysTemp, function (index, value) {
		var layerGroup = new ol.layer.Group({
			title: index,
			type: 'overlay',
			layers: value
		});
		config.layers.push(layerGroup);
	});

	var round = function (value, decimals) {
	  return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
	};
	//Permalink
	var vars = {},
		getUrlParam = function(param, defaultValue) {
			var r = vars[param];
			if (typeof r === 'undefined') {
				r = defaultValue;
			}
			return r;
		};

	if (window.location.hash !== '') {
		window.location.hash.replace(/[#?&]+([^=&]+)=([^&]*)/gi, function(m, key, value) {
			vars[key] = value;
		});

		// map = zoom, center (lon, lat), [rotation]
		var mapParam = getUrlParam('map', ''), parts;
		if (mapParam !== '') {
			parts = mapParam.split('/');
			config.initialConfig.zoom = parseFloat(parts[0]);
			config.initialConfig.lat = parseFloat(parts[1]);
			config.initialConfig.lon = parseFloat(parts[2]);
			if (typeof parts[3] !== 'undefined') {
				config.initialConfig.rotation = parseFloat(parts[3]);
			}
		}

		// base = index
		var baseParam = parseInt(getUrlParam('base', 0), 10);
		$.each(config.layers, function(indexLayer, layer) {
			if (layer.get('type') === 'overlay') {
				// overlays
				var overlayParam = getUrlParam(layer.get('title'), '');
				$.each(layer.getLayers().getArray(), function (overlayIndex, overlayValue) {
					overlayValue.setVisible(!!parseInt(overlayParam.charAt(overlayIndex)));
				});
			} else {
				// overlays
				if (indexLayer === baseParam) {
					layer.setVisible(true);
				} else {
					layer.setVisible(false);
				}
			}
		});

	}

	var view = new ol.View({
		center: ol.proj.fromLonLat([config.initialConfig.lon, config.initialConfig.lat]), // Transform coordinate from EPSG:3857 to EPSG:4326
		rotation: config.initialConfig.rotation,
		zoom: config.initialConfig.zoom
	});

	const map = new ol.Map({
		layers: config.layers,
		target: 'map',
		view: view
	});

	var layersControlBuild = function () {
		var visibleLayer,
			previousLayer,
			layerIndex = 0,
			overlayIndex = 0,
			container = $('<div>').addClass('osmcat-menu'),
			layerDiv = $('<div>').addClass('osmcat-layer'),
			overlaySelect = $('<select>').addClass('osmcat-select').on('change', function () {
				var overlaySelected = $(this).find('option:selected');

				container.find('.osmcat-overlay').hide();
				container.find('.' + overlaySelected.val()).show();
			}),
			overlayDiv = $('<div>').hide().addClass('osmcat-layer').append($('<div>').append(overlaySelect)),
			label = $('<div>').html('<b>&equiv; ' + config.i18n.layersLabel + '</b>').on('click', function () {
				content.toggle();
			}),
			content = $('<div>').addClass('osmcat-content');

		config.layers.forEach(layer => {
			if (layer.get('type') === 'overlay') {
				var title = layer.get('title'),
					layerButton = $('<h3>').html(title),
					overlayDivContent = $('<div>').addClass('osmcat-content osmcat-overlay overlay' + overlayIndex);

				overlaySelect.append($('<option>').val('overlay' + overlayIndex).text(title));

				layer.getLayers().forEach(overlay => {
					var overlaySrc = overlay.get('iconSrc'),
						overlayIconStyle = overlay.get('iconStyle') || '',
						title = (overlaySrc ? '<img src="' + overlaySrc + '" height="16" style="' + overlayIconStyle + '"/> ' : '') + overlay.get('title'),
						overlayButton = $('<div>').html(title).on('click', function () {
							var visible = overlay.getVisible();
							overlay.setVisible(!visible);
							updatePermalink();
						});
					overlayDivContent.append(overlayButton);
					if (overlay.getVisible()) {
						overlayButton.addClass('active');
					}
					overlay.on('change:visible', function () {
						if (overlay.getVisible()) {
							overlayButton.addClass('active');
						} else {
							overlayButton.removeClass('active');
						}
					});
				});

				overlayDiv.append(overlayDivContent);
				overlayDiv.show();
				overlayIndex++;
			} else {
				var layerSrc = layer.get('iconSrc'),
					title = (layerSrc ? '<img src="' + layerSrc + '" height="16"/> ' : '') + layer.get('title'),
					layerButton = $('<div>').html(title).on('click', function () {
						var visible = layer.getVisible();

						if (visible) { //Show the previous layer
							if (previousLayer) {
								baseLayerIndex = previousLayer.get('layerIndex');
								layer.setVisible(!visible);
								previousLayer.setVisible(visible);
								visibleLayer = previousLayer;
								previousLayer = layer;
							}
						} else { //Active the selected layer and hide the current layer
							baseLayerIndex = layer.get('layerIndex');
							layer.setVisible(!visible);
							visibleLayer.setVisible(visible);
							previousLayer = visibleLayer;
							visibleLayer = layer;
						}
						updatePermalink();
					});

					layer.set('layerIndex', layerIndex);

				content.append(layerButton);
				if (layer.getVisible()) {
					if (visibleLayer === undefined) {
						layerButton.addClass('active');
						visibleLayer = layer;
						baseLayerIndex = layerIndex;
					} else {
						layer.setVisible(false);
					}
				}
				layer.on('change:visible', function () {
					if (layer.getVisible()) {
						layerButton.addClass('active');
					} else {
						layerButton.removeClass('active');
					}
				});
				layerIndex++;
			}
		});
		layerDiv.append(label, content);
		container.append(layerDiv, overlayDiv);
		overlaySelect.trigger('change');

		return container;
	};

	$('#menu').append(layersControlBuild());

	map.addControl(new ol.control.MousePosition({
		coordinateFormat: function (coordinate) {
			return ol.coordinate.format(coordinate, '[{y}, {x}]', 5);
		},
		projection: 'EPSG:4326'
	}));
	map.addControl(new ol.control.ScaleLine({units: config.initialConfig.units}));
	map.addControl(new ol.control.ZoomSlider());

	// Geolocation Control
	// In some browsers, this feature is available only in secure contexts (HTTPS)
	var geolocationControlBuild = function () {
		var container = $('<div>').addClass('ol-control ol-unselectable osmcat-geobutton').html($('<button type="button"><i class="fa fa-bullseye"></i></button>').on('click', function () {
			if (navigator.geolocation) {
				if (location.protocol !== 'https') {
					console.warn('In some browsers, this feature is available only in secure context (HTTPS)');
				}
				navigator.geolocation.getCurrentPosition(function (position) {
					var latitude = position.coords.latitude;
					var longitude = position.coords.longitude;

					view.animate({
						zoom: config.initialConfig.zoomGeolocation,
						center: ol.proj.fromLonLat([longitude, latitude])
					});
				}, function (error) {
					console.error(error.message, error);
					alert(error.message);
				});
			} else {
				console.error('Geolocation is not supported by your browser');
			}
		}));
		return container[0];
	};
	map.addControl(new ol.control.Control({
		element: geolocationControlBuild()
	}));

	// Info Control
	var infoControlBuild = function () {
		var container = $('<div>').addClass('ol-control ol-unselectable osmcat-infobutton').html($('<button type="button"><i class="fa fa-info-circle"></i></button>').on('click', function () {
			window.location.href = 'https://github.com/yopaseopor/osmlitmap';
		}));
		return container[0];
	};
	map.addControl(new ol.control.Control({
		element: infoControlBuild()
	}));
	
		// Info Control
	var infoControlBuild2 = function () {
		var container = $('<div>').addClass('ol-control ol-unselectable osmcat-infobutton2').html($('<button type="button"><i class="fa fa-search-plus"></i></button>').on('click', function () {
			window.location.href = 'https://pietervdvn.github.io/MapComplete/index.html?userlayout=lit#eyJpZCI6ImxpdCIsInRpdGxlIjp7ImVuIjoiTGl0IiwiY2EiOiJJbLdsdW1pbmFjafMiLCJlcyI6IklsdW1pbmFjafNuIn0sInNob3J0RGVzY3JpcHRpb24iOnsiZW4iOiJDb3ZlciBsaXQgaW5mbyIsImNhIjoiQ29icmVpeCBpbmZvcm1hY2nzIHNvYnJlIGlst2x1bWluYWNp8yIsImVzIjoiQ3VicmUgaW5mb3JtYWNp824gc29icmUgaWx1bWluYWNp824ifSwiZGVzY3JpcHRpb24iOnsiZW4iOiJBZGQgbGl0IGluZm9ybWF0aW9uIGFuZCBhbHNvIGxpdDpwZXJjZWl2ZWQiLCJjYSI6IkFmZWdlaXggaW5mb3JtYWNp8yBzb2JyZSBpbLdsdW1pbmFjafMgaSBwZXJjZXBjafMgZGUgbGEgaWy3bHVtaW5hY2nzIiwiZXMiOiJB8WFkZSBpbmZvcm1hY2nzbiBzb2JyZSBpbHVtaW5hY2nzbiB5IHBlcmNlcGNp824gZGUgbGEgbWlzbWEifSwibGFuZ3VhZ2UiOlsiZW4iLCJjYSIsImVzIl0sIm1haW50YWluZXIiOiIiLCJpY29uIjoiaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL09TTS1DYXRhbGFuL29zbWNhdG1hcC9tYXN0ZXIvaW1nL2ljb25lc19sbHVtL2xpdF9vc20uc3ZnIiwidmVyc2lvbiI6IjAiLCJzdGFydExhdCI6MCwic3RhcnRMb24iOjAsInN0YXJ0Wm9vbSI6MSwid2lkZW5GYWN0b3IiOjAuMDEsInNvY2lhbEltYWdlIjoiIiwibGF5ZXJzIjpbeyJpZCI6ImxpdHMiLCJuYW1lIjp7ImVuIjoiQ292ZXIgbGl0cyBpbmZvIiwiY2EiOiJDb2JyZWl4IGluZm9ybWFjafMgc29icmUgaWy3bHVtaW5hY2nzIiwiZXMiOiJDdWJyZSBpbmZvcm1hY2nzbiBzb2JyZSBpbHVtaW5hY2nzbiJ9LCJtaW56b29tIjoxOCwib3ZlcnBhc3NUYWdzIjp7Im9yIjpbImhpZ2h3YXl+cmVzaWRlbnRpYWx8bGl2aW5nX3N0cmVldHxwZWRlc3RyaWFufHRlcnRpYXJ5fHNlcnZpY2V8dW5jbGFzc2lmaWVkfHNlY29uZGFyeXxwcmltYXJ5fHRydW5rfG1vdG9yd2F5fHRlcnRpYXJ5X2xpbmt8c2Vjb25kYXJ5X2xpbmt8cHJpbWFyeV9saW5rfHRydW5rX2xpbmt8bW90b3J3YXlfbGlua3xmb290d2F5Iix7ImFuZCI6WyJsaXQ6cGVyY2VpdmVkfioiXX1dfSwidGl0bGUiOnsicmVuZGVyIjp7ImVuIjoie25hbWV9IiwiY2EiOiJ7bmFtZX0iLCJlcyI6IntuYW1lfSJ9LCJtYXBwaW5ncyI6W3siaWYiOnsiYW5kIjpbImxpdDpwZXJjZWl2ZWR+KiJdfSwidGhlbiI6eyJlbiI6IlBvaW50IiwiY2EiOiJQdW50IiwiZXMiOiJQdW50byJ9fV19LCJkZXNjcmlwdGlvbiI6eyJlbiI6IkNvbXBsZXRlIHlvdXIgbGlnaHQgaW5mbyBpbiB0aGUgc3RyZWV0IiwiY2EiOiJDb21wbGV0YSBsYSBpbmZvcm1hY2nzIHNvYnJlIGlst2x1bWluYWNp8yBkZWwgY2FycmVyIiwiZXMiOiJDb21wbGV0YSBsYSBpbmZvcm1hY2nzbiBzb2JyZSBpbHVtaW5hY2nzbiBkZSBsYSBjYWxsZSJ9LCJ0YWdSZW5kZXJpbmdzIjpbeyJyZW5kZXIiOnsiZW4iOiJObyBpbmZvIGFib3V0IGxpdCIsImNhIjoiU2Vuc2UgaW5mbyBzb2JyZSBpbLdsdW1pbmFjafMiLCJlcyI6IlNpbiBpbmZvIHNvYnJlIGlsdW1pbmFjafNuIn0sInF1ZXN0aW9uIjp7ImVuIjoiSGFzIGxpdCB0aGlzIHdheT8iLCJjYSI6IkVzdOAgaWy3bHVtaW5hZGEgYXF1ZXN0YSB2aWE/IiwiZXMiOiK/RXN04SBpbHVtaW5hZGEgZXN0YSB27WE/In0sIm1hcHBpbmdzIjpbeyJpZiI6eyJhbmQiOlsibGl0PXllcyJdfSwidGhlbiI6eyJlbiI6IlRoZXJlJ3MgbGl0IiwiY2EiOiJIaSBoYSBsbHVtIiwiZXMiOiJIYXkgbHV6In19LHsiaWYiOnsiYW5kIjpbImxpdD1ubyJdfSwidGhlbiI6eyJlbiI6IlRoZXJlIGlzIG5vIGxpdCIsImNhIjoiTm8gaGkgaGEgbGx1bSIsImVzIjoiTm8gaGF5IGx1eiJ9fV19LHsicmVuZGVyIjp7ImVuIjoiTm8gZGF0YSBhYm91dCBwZXJjZWl2ZWQgbGl0IiwiY2EiOiJTZW5zZSBkYWRlcyBkZSBwZXJjZXBjafMiLCJlcyI6IlNpbiBkYXRvcyBkZSBwZXJjZXBjafNuIn0sInF1ZXN0aW9uIjp7ImVuIjoiSG93IGRvIHlvdSBwZXJjZWl2ZSB0aGUgbGlnaHQ/IiwiY2EiOiJDb20gZGVzY3JpdXJpZXMgbGEgbGx1bSBkJ2FxdWVzdCBsbG9jPyIsImVzIjoiv0NvbW8gZGVzY3JpYmly7WFzIGxhIGlsdW1pbmFjafNuIGRlIGVzdGUgbHVnYXI/In0sIm1hcHBpbmdzIjpbeyJpZiI6eyJhbmQiOlsibGl0OnBlcmNlaXZlZD1ub25lIl19LCJ0aGVuIjp7ImVuIjoiUGVyY2VwdGlvbjpUaGVyZSBpcyBub3QgbGlnaHQiLCJjYSI6IlBlcmNlcGNp8zpObyBoaSBoYSBsbHVtIiwiZXMiOiJQZXJjZXBjafNuOk5vIGhheSBsdXoifX0seyJpZiI6eyJhbmQiOlsibGl0OnBlcmNlaXZlZD1taW5pbWFsIl19LCJ0aGVuIjp7ImVuIjoiUGVyY2VwdGlvbjpNaW5pbWFsIiwiY2EiOiJQZXJjZXBjafM6T2JzY3VyLCBt7W5pbWEiLCJlcyI6IlBlcmNlcGNp8246T3NjdXJvLCBt7W5pbWEifX0seyJpZiI6eyJhbmQiOlsibGl0OnBlcmNlaXZlZD1wb29yIl19LCJ0aGVuIjp7ImVuIjoiUGVyY2VwdGlvbjpQb29yIiwiY2EiOiJQZXJjZXBjafM6UG9icmUiLCJlcyI6IlBlcmNlcGNp8246UG9icmUifX0seyJpZiI6eyJhbmQiOlsibGl0OnBlcmNlaXZlZD1nb29kIl19LCJ0aGVuIjp7ImVuIjoiUGVyY2VwdGlvbjpHb29kIiwiY2EiOiJQZXJjZXBjafM6Qm9uYSIsImVzIjoiUGVyY2VwY2nzbjpCdWVuYSJ9fSx7ImlmIjp7ImFuZCI6WyJsaXQ6cGVyY2VpdmVkPWRheWxpa2UiXX0sInRoZW4iOnsiZW4iOiJQZXJjZXB0aW9uOkRheWxpa2UiLCJjYSI6IlBlcmNlcGNp8zpTZW1ibGEgZGUgZGlhIiwiZXMiOiJQZXJjZXBjafNuOlBhcmVjZSBxdWUgc2VhIGRlIGTtYSJ9fV19XSwiaGlkZVVuZGVybGF5aW5nRmVhdHVyZXNNaW5QZXJjZW50YWdlIjowLCJpY29uIjp7InJlbmRlciI6Imh0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9PU00tQ2F0YWxhbi9vc21jYXRtYXAvbWFzdGVyL2ltZy9pY29uZXNfbGx1bS9saXRfb3NtLnN2ZyIsIm1hcHBpbmdzIjpbeyJpZiI6eyJhbmQiOlsibGl0OnBlcmNlaXZlZD1ub25lIl19LCJ0aGVuIjp7ImVuIjoiaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL09TTS1DYXRhbGFuL29zbWNhdG1hcC9tYXN0ZXIvaW1nL2ljb25lc19sbHVtL2xpdF9vc21fbm9uZS5zdmciLCJjYSI6Imh0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9PU00tQ2F0YWxhbi9vc21jYXRtYXAvbWFzdGVyL2ltZy9pY29uZXNfbGx1bS9saXRfb3NtX25vbmUuc3ZnIiwiZXMiOiJodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vT1NNLUNhdGFsYW4vb3NtY2F0bWFwL21hc3Rlci9pbWcvaWNvbmVzX2xsdW0vbGl0X29zbV9ub25lLnN2ZyJ9fSx7ImlmIjp7ImFuZCI6WyJsaXQ6cGVyY2VpdmVkPW1pbmltYWwiXX0sInRoZW4iOnsiZW4iOiJodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vT1NNLUNhdGFsYW4vb3NtY2F0bWFwL21hc3Rlci9pbWcvaWNvbmVzX2xsdW0vbGl0X29zbV9taW5pbWFsLnN2ZyIsImNhIjoiaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL09TTS1DYXRhbGFuL29zbWNhdG1hcC9tYXN0ZXIvaW1nL2ljb25lc19sbHVtL2xpdF9vc21fbWluaW1hbC5zdmciLCJlcyI6Imh0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9PU00tQ2F0YWxhbi9vc21jYXRtYXAvbWFzdGVyL2ltZy9pY29uZXNfbGx1bS9saXRfb3NtX21pbmltYWwuc3ZnIn19LHsiaWYiOnsiYW5kIjpbImxpdDpwZXJjZWl2ZWQ9cG9vciJdfSwidGhlbiI6eyJlbiI6Imh0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9PU00tQ2F0YWxhbi9vc21jYXRtYXAvbWFzdGVyL2ltZy9pY29uZXNfbGx1bS9saXRfb3NtX3Bvb3Iuc3ZnIiwiY2EiOiJodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vT1NNLUNhdGFsYW4vb3NtY2F0bWFwL21hc3Rlci9pbWcvaWNvbmVzX2xsdW0vbGl0X29zbV9wb29yLnN2ZyIsImVzIjoiaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL09TTS1DYXRhbGFuL29zbWNhdG1hcC9tYXN0ZXIvaW1nL2ljb25lc19sbHVtL2xpdF9vc21fcG9vci5zdmcifX0seyJpZiI6eyJhbmQiOlsibGl0OnBlcmNlaXZlZD1nb29kIl19LCJ0aGVuIjp7ImVuIjoiaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL09TTS1DYXRhbGFuL29zbWNhdG1hcC9tYXN0ZXIvaW1nL2ljb25lc19sbHVtL2xpdF9vc21fZ29vZC5zdmciLCJjYSI6Imh0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9PU00tQ2F0YWxhbi9vc21jYXRtYXAvbWFzdGVyL2ltZy9pY29uZXNfbGx1bS9saXRfb3NtX2dvb2Quc3ZnIiwiZXMiOiJodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vT1NNLUNhdGFsYW4vb3NtY2F0bWFwL21hc3Rlci9pbWcvaWNvbmVzX2xsdW0vbGl0X29zbV9nb29kLnN2ZyJ9fSx7ImlmIjp7ImFuZCI6WyJsaXQ6cGVyY2VpdmVkPWRheWxpa2UiXX0sInRoZW4iOnsiZW4iOiJodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vT1NNLUNhdGFsYW4vb3NtY2F0bWFwL21hc3Rlci9pbWcvaWNvbmVzX2xsdW0vbGl0X29zbV9kYXlsaWtlLnN2ZyIsImNhIjoiaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL09TTS1DYXRhbGFuL29zbWNhdG1hcC9tYXN0ZXIvaW1nL2ljb25lc19sbHVtL2xpdF9vc21fZGF5bGlrZS5zdmciLCJlcyI6Imh0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9PU00tQ2F0YWxhbi9vc21jYXRtYXAvbWFzdGVyL2ltZy9pY29uZXNfbGx1bS9saXRfb3NtX2RheWxpa2Uuc3ZnIn19XX0sIndpZHRoIjp7InJlbmRlciI6IjQifSwiaWNvblNpemUiOnsicmVuZGVyIjoiNjAsNjAsY2VudGVyIiwibWFwcGluZ3MiOltdfSwiY29sb3IiOnsicmVuZGVyIjoiIiwibWFwcGluZ3MiOlt7ImlmIjp7ImFuZCI6WyJsaXQ9eWVzIl19LCJ0aGVuIjp7ImVuIjoiZ3JlZW4iLCJjYSI6ImdyZWVuIiwiZXMiOiJncmVlbiJ9fSx7ImlmIjp7ImFuZCI6WyJsaXQ9bm8iXX0sInRoZW4iOnsiZW4iOiJibGFjayIsImNhIjoiYmxhY2siLCJlcyI6ImJsYWNrIn19LHsiaWYiOnsiYW5kIjpbImxpdCF+Il19LCJ0aGVuIjp7ImVuIjoicmVkIiwiY2EiOiJyZWQiLCJlcyI6InJlZCJ9fV0sImNvbmRpdGlvbiI6eyJhbmQiOltdfX0sInByZXNldHMiOlt7InRhZ3MiOlsibGl0OnBlcmNlaXZlZD1ub25lIl0sInRpdGxlIjp7ImVuIjoiUGVyY2VpdmVkIGxpdDogTm9uZSIsImNhIjoiUGVyY2VwY2nzOiBDYXAiLCJlcyI6IlBlcmNlcGNp8246IE5pbmd1bmEifSwiZGVzY3JpcHRpb24iOnsiZW4iOiJUaGVyZSBpcyBubyBsaXQgdG8gcGVyY2VpdmUiLCJjYSI6Ik5vIGhpIGhhIGxsdW0gYSBwZXJjZWJyZSIsImVzIjoiTm8gaGF5IGx1eiBhIHBlcmNpYmlyIn19LHsidGFncyI6WyJsaXQ6cGVyY2VpdmVkPW1pbmltYWwiXSwidGl0bGUiOnsiZW4iOiJQZXJjZWl2ZWQgbGl0OiBNaW5pbWFsIiwiY2EiOiJQZXJjZXBjafM6IE3tbmltYSIsImVzIjoiUGVyY2VwY2nzbjogTe1uaW1hIn0sImRlc2NyaXB0aW9uIjp7ImVuIjoiVGhlcmUgaXMgbWluaW1hbCBwZXJjZXB0aW9uIG9mIGxpdCIsImNhIjoiTe1uaW1hOiBtYXNzYSBmb3NjIiwiZXMiOiJN7W5pbWE6IG11eSBvc2N1cm8ifX0seyJ0YWdzIjpbImxpdDpwZXJjZWl2ZWQ9cG9vciJdLCJ0aXRsZSI6eyJlbiI6IlBlcmNlaXZlZCBsaXQ6IFBvb3IiLCJjYSI6IlBlcmNlcGNp8zogUG9icmUiLCJlcyI6IlBlcmNlcGNp8246IFBvYnJlIn0sImRlc2NyaXB0aW9uIjp7ImVuIjoiVGhlcmUgaXMgYSBwb29yIHBlcmNlcHRpb24gb2YgdGhlIGxpdCIsImNhIjoiUG9icmU6IG5vIGVzIGRpc3RpbmdlaXhlbiBsZXMgY2FyZXMiLCJlcyI6IlBvYnJlOiBObyBzZSBkaXN0aW5ndWVuIGxhcyBjYXJhcyJ9fSx7InRhZ3MiOlsibGl0OnBlcmNlaXZlZD1nb29kIl0sInRpdGxlIjp7ImVuIjoiUGVyY2VpdmVkIGxpdDogR29vZCIsImNhIjoiUGVyY2VwY2nzOiBCb25hIiwiZXMiOiJQZXJjZXBjafNuOiBCdWVuYSJ9LCJkZXNjcmlwdGlvbiI6eyJlbiI6IlRoZXJlIGlzIGEgZ29vZCBwZXJjZXB0aW9uIG9mIGxpdCIsImNhIjoiQm9uYSBpbLdsdW1pbmFjafMsIHN1ZmljaWVudCIsImVzIjoiQnVlbmEgaWx1bWluYWNp824sIHN1ZmljaWVudGUifX0seyJ0YWdzIjpbImxpdDpwZXJjZWl2ZWQ9ZGF5bGlrZSJdLCJ0aXRsZSI6eyJlbiI6IlBlcmNlaXZlZCBsaXQ6IERheWxpa2UiLCJjYSI6IlBlcmNlcGNp8zogU2VtYmxhIGRlIGRpYSIsImVzIjoiUGVyY2VwY2nzbjogUGFyZWNlIGRlIGTtYSJ9LCJkZXNjcmlwdGlvbiI6eyJlbiI6IlRoZXJlIGlzIGRheWxpa2UgcGVyY2VwdGlvbiBvZiB0aGUgbGl0IiwiY2EiOiJTZW1ibGEgZGUgZGlhLCDzcHRpbWEiLCJlcyI6IlBhcmVjZSBkZSBk7WEsIPNwdGltYSJ9fV19XSwicm9hbWluZ1JlbmRlcmluZ3MiOltdfQ==';
		}));
		return container[0];
	};
	map.addControl(new ol.control.Control({
		element: infoControlBuild2()
	}));

	// Copy permalink button
	var permalinkControlBuild = function () {
		var container = $('<div>').addClass('ol-control ol-unselectable osmcat-sharebutton').html($('<button type="button"><i class="fa fa-share-alt-square"></i></button>').on('click', function () {
			var dummyInput = $('<input>').val(window.location.href),
				successful = false;

			$('body').append(dummyInput);
			dummyInput.focus();
			dummyInput.select();
			successful = document.execCommand('copy');
			dummyInput.remove();
			if (successful) {
				var modalDialogTimeout,
					modalDialog = $('<div>').html(config.i18n.copyDialog).dialog({
					modal: true,
					resizable: false,
					close: function () {
						clearTimeout(modalDialogTimeout);
						$(this).dialog('destroy');
					}
				});
				modalDialogTimeout = setTimeout(function(){
					modalDialog.dialog('destroy');
				}, 3000);
			}
		}));
		return container[0];
	};
	map.addControl(new ol.control.Control({
		element: permalinkControlBuild()
	}));

	// Rotate left button
	var rotateleftControlBuild = function () {
		var container = $('<div>').addClass('ol-control ol-unselectable osmcat-rotateleft').html($('<button type="button"><i class="fa fa-undo"></i></button>').on('click', function () {
			var currentRotation = view.getRotation();
			if (currentRotation > -6.1) { //360º = 2 Pi r =aprox 6.2
				view.setRotation(round(currentRotation - 0.1, 2));
			} else {
				view.setRotation(0);
			}
		}));
		return container[0];
	};
	map.addControl(new ol.control.Control({
		element: rotateleftControlBuild()
	}));

	// Rotate right button
	var rotaterightControlBuild = function () {
		var container = $('<div>').addClass('ol-control ol-unselectable osmcat-rotateright').html($('<button type="button"><i class="fa fa-repeat"></i></button>').on('click', function () {
			var currentRotation = view.getRotation();
			if (currentRotation < 6.1) { //360º = 2 Pi r =aprox 6.2
				view.setRotation(round(currentRotation + 0.1, 2));
			} else {
				view.setRotation(0);
			}
		}));
		return container[0];
	};
	map.addControl(new ol.control.Control({
		element: rotaterightControlBuild()
	}));

	$('#map').css('cursor', 'grab');
	map.on('movestart', function (evt) {
		$('#map').css('cursor', 'grabbing');
	});

	var shouldUpdate = true;
	// restore the view state when navigating through the history, see
	// https://developer.mozilla.org/en-US/docs/Web/API/WindowEventHandlers/onpopstate
	window.addEventListener('popstate', function(event) {
		if (event.state === null) {
			return;
		}
		map.getView().setCenter(ol.proj.fromLonLat(event.state.center));
		map.getView().setZoom(event.state.zoom);
		map.getView().setRotation(event.state.rotation);

		$.each(config.layers, function(indexLayer, layer) {
			if (layer.get('type') === 'overlay') {
				// overlays
				var overlayParam = event.state.overlay[layer.get('title')];
				if (typeof overlayParam === 'undefined') {
					overlayParam = '';
				}
				$.each(layer.getLayers().getArray(), function (overlayIndex, overlayValue) {
					overlayValue.setVisible(!!parseInt(overlayParam.charAt(overlayIndex)));
				});
			} else {
				// overlays
				if (indexLayer === event.state.baseLayer) {
					layer.setVisible(true);
				} else {
					layer.setVisible(false);
				}
			}
		});

		shouldUpdate = false;
	});

	var updatePermalink = function() {
		if (!shouldUpdate) {
			// do not update the URL when the view was changed in the 'popstate' handler
			shouldUpdate = true;
			return;
		}

		var zoom = round(view.getZoom(), 3),
			center = ol.proj.toLonLat(view.getCenter()),
			rotation = round(view.getRotation(), 2),
			overlayState = {};

		var hash = '#map=' + zoom + '/' + round(center[1], 5) + '/' + round(center[0], 5) + '/' + rotation;
		if (baseLayerIndex !== 0) {
			hash += '&base=' + baseLayerIndex;
		}

		$.each(config.layers, function(indexLayer, layer) {
			var hashOverlay = '', addHash = false;
			if (layer.get('type') === 'overlay') {
				// overlays
				$.each(layer.getLayers().getArray(), function (overlayIndex, overlayValue) {
					if (overlayValue.getVisible()) {
						hashOverlay += '1';
						addHash = true;
					} else {
						hashOverlay += '0';
					}
				});
				if (addHash) {
					hash += '&' + layer.get('title') + '=' + hashOverlay;
				}
				overlayState[layer.get('title')] = hashOverlay;
			}
		});

		var state = {
			zoom: zoom,
			center: center,
			rotation: rotation,
			baseLayer: baseLayerIndex,
			overlay: overlayState
		};

		window.history.pushState(state, 'map', hash);
	};

	map.on('moveend', function (evt) {
		$('#map').css('cursor', 'grab');
		updatePermalink();
	});

	var selectedFeature = null;
	map.on('pointermove', function (evt) {
		if (selectedFeature !== null) {
			selectedFeature.setStyle(undefined);
			selectedFeature = null;
			$('#map').css('cursor', 'grab');
		}
		map.forEachFeatureAtPixel(evt.pixel, function (feature) {
			selectedFeature = feature;
			$('#map').css('cursor', 'pointer');
			return true;
		});
	});

	map.on('singleclick', function (evt) {
		var coordinate = evt.coordinate,
				coordinateLL = ol.proj.toLonLat(coordinate),
				coordinateText = ol.coordinate.format(coordinateLL, '[{y}, {x}]', 5);
		console.log('pinMap', coordinateText);
		var pinMap = new ol.Overlay({
			element: $('<div>').addClass('osmcat-map-pin').attr('title', coordinateText).html('<i class="fa fa-map-pin"></i>')[0],
			position: coordinate
			//positioning: 'bottom-center' //BUG center no funciona correctament en la v6.1.1 -> FIX setPositioning
		});
		map.addOverlay(pinMap);
		pinMap.setPositioning('bottom-center'); //FIX bug al centrar l'element

		var popupContingut = config.onClickEvent.call(this, evt, view, coordinateLL);

		var nodeInfo = $('<div>');
		var numFeatures = 0;
		map.forEachFeatureAtPixel(evt.pixel, function (feature) {
			numFeatures++;
			nodeInfo.append(config.forFeatureAtPixel.call(this, evt, feature));
		});

		var popupContingutExtra = config.onClickEventExtra.call(this, evt, view, coordinateLL, numFeatures);

		$('<div>').html([popupContingut, nodeInfo, popupContingutExtra]).dialog({
			title: coordinateText,
			position: {my: 'left top', at: 'left bottom', of: $(pinMap.getElement())},
			close: function () {
				$(this).dialog('destroy');
				map.removeOverlay(pinMap);
			},
			focus: function () {
				$(pinMap.getElement()).animate({color: '#F00', paddingBottom: 5}, 200).animate({color: '#000', paddingBottom: 0}, 200).animate({color: '#F00', paddingBottom: 5}, 200).animate({color: '#000', paddingBottom: 0}, 200).animate({color: '#F00', paddingBottom: 5}, 200).animate({color: '#000', paddingBottom: 0}, 200);
			}
		});

	});
});

function linearColorInterpolation(colorFrom, colorTo, weight) {
	var p = weight < 0 ? 0 : (weight > 1 ? 1 : weight),
		w = p * 2 - 1,
		w1 = (w/1+1) / 2,
		w2 = 1 - w1,
		rgb = [Math.round(colorTo[0] * w1 + colorFrom[0] * w2), Math.round(colorTo[1] * w1 + colorFrom[1] * w2), Math.round(colorTo[2] * w1 + colorFrom[2] * w2)];
	return rgb;
}
