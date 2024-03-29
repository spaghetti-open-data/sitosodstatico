(function ($) {

  Drupal.leaflet._create_layer_orig = Drupal.leaflet.create_layer;

  Drupal.leaflet.create_layer = function(layer, key) {
    if (layer.type === 'quad') {
      var mapLayer = new L.TileLayerQuad(layer.urlTemplate, layer.options);
      mapLayer._leaflet_id = key;
      return mapLayer;
    }
    if (layer.type === 'google' && layer.options.detectRetina && L.Browser.retina) {
      layer.urlTemplate += '&style=high_dpi&w=512';
      layer.options.tileSize = 512;
      var mapLayer = new L.TileLayer(layer.urlTemplate, layer.options);
      mapLayer._leaflet_id = key;
      return mapLayer;
    }
    // Default to the original code;
    return Drupal.leaflet._create_layer_orig(layer, key);
  };

})(jQuery);

L.TileLayerQuad = L.TileLayer.extend({

  getTileUrl: function(tilePoint) {
    this._adjustTilePoint(tilePoint);

    return L.Util.template(this._url, L.extend({
      s: this._getSubdomain(tilePoint),
      q: this._xyzToQuad(tilePoint.x, tilePoint.y, this._getZoomForUrl())
    }, this.options));
  },

  /** Convert xyz tile coordinates to a single quadtree key string.
   *
   * The length of the quadkey equals the zoom level. Note: zoom > 0.
   *
   * Adapted from http://msdn.microsoft.com/en-us/library/bb259689.aspx
   */
  _xyzToQuad: function(x, y, zoom) {
    var quadKey = '', digit, mask;
    for (var z = zoom; z > 0; z--) {
      digit = 0;
      mask = 1 << (z - 1);
      if ((x & mask) !== 0) {
        digit = 1;
      }
      if ((y & mask) !== 0) {
        digit += 2;
      }
      // At this point digit equals 0, 1, 2 or 3. Append digit to quad key and
      // advance to the next zoom level to calculate the next digit.
      quadKey += digit;
    }
    return quadKey;
  }
});
;
/*
 * We are overriding a large part of the JS defined in leaflet (leaflet.drupal.js).
 * Not nice, but we can't do otherwise without refactoring code in Leaflet.
 */

(function ($) {

  var LEAFLET_MARKERCLUSTER_EXCLUDE_FROM_CLUSTER = 0x01;

  Drupal.behaviors.leaflet = { // overrides same behavior in leaflet/leaflet.drupal.js
    attach: function(context, settings) {

      $(settings.leaflet).each(function () {
        // bail if the map already exists
        var container = L.DomUtil.get(this.mapId);
        if (!container || container._leaflet) {
          return false;
        }

        // load a settings object with all of our map and markercluster settings
        var settings = {};
        for (var setting in this.map.settings) {
          settings[setting] = this.map.settings[setting];
        }

        // instantiate our new map
        var lMap = new L.Map(this.mapId, settings);
        lMap.bounds = [];

        // add map layers
        var layers = {}, overlays = {};
        var i = 0;
        for (var key in this.map.layers) {
          var layer = this.map.layers[key];
          var map_layer = Drupal.leaflet.create_layer(layer, key);

          layers[key] = map_layer;

          // add the layer to the map
          if (i >= 0) {
            lMap.addLayer(map_layer);
          }
          i++;
        }

        // @RdB create a marker cluster layer if leaflet.markercluster.js is included
        var cluster_layer = null;
        if (typeof L.MarkerClusterGroup != 'undefined') {

          // If we specified a custom cluster icon, use that.
          if (this.map.markercluster_icon) {
            var icon_settings = this.map.markercluster_icon;

            settings['iconCreateFunction'] = function(cluster) {
              var icon = new L.Icon({iconUrl: icon_settings.iconUrl});

              // override applicable marker defaults
              if (icon_settings.iconSize) {
                icon.options.iconSize = new L.Point(parseInt(icon_settings.iconSize.x), parseInt(icon_settings.iconSize.y));
              }
              if (icon_settings.iconAnchor) {
                icon.options.iconAnchor = new L.Point(parseFloat(icon_settings.iconAnchor.x), parseFloat(icon_settings.iconAnchor.y));
              }
              if (icon_settings.popupAnchor) {
                icon.options.popupAnchor = new L.Point(parseFloat(icon_settings.popupAnchor.x), parseFloat(icon_settings.popupAnchor.y));
              }
              if (icon_settings.shadowUrl !== undefined) {
                icon.options.shadowUrl = icon_settings.shadowUrl;
              }
              if (icon_settings.shadowSize) {
                icon.options.shadowSize = new L.Point(parseInt(icon_settings.shadowSize.x), parseInt(icon_settings.shadowSize.y));
              }
              if (icon_settings.shadowAnchor) {
                icon.options.shadowAnchor = new L.Point(parseInt(icon_settings.shadowAnchor.x), parseInt(icon_settings.shadowAnchor.y));
              }

              return icon;
            }
          }

          // Note: only applicable settings will be used, remainder are ignored
          cluster_layer = new L.MarkerClusterGroup(settings);
          lMap.addLayer(cluster_layer);
        }

        // add features
        for (i = 0; i < this.features.length; i++) {
          var feature = this.features[i];
          var cluster = (feature.type == 'point') && (!feature.flags || !(feature.flags & LEAFLET_MARKERCLUSTER_EXCLUDE_FROM_CLUSTER));
          var lFeature;

          // dealing with a layer group
          if (feature.group) {
            var lGroup = new L.LayerGroup();
            for (var groupKey in feature.features) {
              var groupFeature = feature.features[groupKey];
              lFeature = leaflet_create_feature(groupFeature, lMap);
              if (groupFeature.popup) {
                lFeature.bindPopup(groupFeature.popup);
              }
              lGroup.addLayer(lFeature);
            }

            // add the group to the layer switcher
            overlays[feature.label] = lGroup;

            if (cluster_layer && cluster)  {
              cluster_layer.addLayer(lGroup);
            } else {
              lMap.addLayer(lGroup);
            }
          }
          else {
            lFeature = leaflet_create_feature(feature, lMap);
            // @RdB add to cluster layer if one is defined, else to map
            if (cluster_layer && cluster) {
              cluster_layer.addLayer(lFeature);
            }
            else {
              lMap.addLayer(lFeature);
            }
            if (feature.popup) {
              lFeature.bindPopup(feature.popup, {autoPanPadding: L.point(25,25)});
            }
          }

          // Allow others to do something with the feature that was just added to the map
          $(document).trigger('leaflet.feature', [lFeature, feature]);
        }

        // add layer switcher
        if (this.map.settings.layerControl) {
          lMap.addControl(new L.Control.Layers(layers, overlays));
        }

        // center the map
        if (this.map.center) {
          lMap.setView(new L.LatLng(this.map.center.lat, this.map.center.lon), this.map.settings.zoom);
        }
        // if we have provided a zoom level, then use it after fitting bounds
        else if (this.map.settings.zoom && this.features.length > 0) {
          Drupal.leaflet.fitbounds(lMap);
          lMap.setZoom(this.map.settings.zoom);
        }
        // fit to bounds
        else {
          Drupal.leaflet.fitbounds(lMap);
        }
        // associate the center and zoom level proprerties to the built lMap.
        // useful for post-interaction with it
        lMap.center = lMap.getCenter();
        lMap.zoom = lMap.getZoom();

        // add attribution
        if (this.map.settings.attributionControl && this.map.attribution) {
          lMap.attributionControl.setPrefix(this.map.attribution.prefix);
          lMap.attributionControl.addAttribution(this.map.attribution.text);
        }

        // add the leaflet map to our settings object to make it accessible
        this.lMap = lMap;

        // allow other modules to get access to the map object using jQuery's trigger method
        $(document).trigger('leaflet.map', [this.map, lMap]);

        // Destroy features so that an AJAX reload does not get parts of the old set.
        // Required when the View has "Use AJAX" set to Yes.
        this.features = null;
      });

      function leaflet_create_feature(feature, lMap) {
        var lFeature;
        switch (feature.type) {
          case 'point':
            lFeature = Drupal.leaflet.create_point(feature, lMap);
            break;
          case 'linestring':
            lFeature = Drupal.leaflet.create_linestring(feature, lMap);
            break;
          case 'polygon':
            lFeature = Drupal.leaflet.create_polygon(feature, lMap);
            break;
          case 'multipolygon':
          case 'multipolyline':
            lFeature = Drupal.leaflet.create_multipoly(feature, lMap);
            break;
          case 'json':
            lFeature = Drupal.leaflet.create_json(feature.json, lMap);
            break;
          case 'popup':
            lFeature = Drupal.leaflet.create_popup(feature, lMap);
            break;
          case 'circle':
            lFeature = Drupal.leaflet.create_circle(feature, lMap);
            break;
        }

        // assign our given unique ID, useful for associating nodes
        if (feature.leaflet_id) {
          lFeature._leaflet_id = feature.leaflet_id;
        }

        var options = {};
        if (feature.options) {
          for (var option in feature.options) {
            options[option] = feature.options[option];
          }
          lFeature.setStyle(options);
        }
        return lFeature;
      }

    }
  }

})(jQuery);
;
