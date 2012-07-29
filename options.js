"use strict";

var wadokei = (function() {
  var m = function(type,args,cont) {
    (args = args || {}).type = type;
    chrome.extension.sendMessage(args, cont);
  };
  return {
    bell : {
      setAudioUrl: function(url, cont) {
        m('wadokei.bell.setAudioUrl',{url:url}, cont);
      },
      getAudioUrl: function(cont) {
        m('wadokei.bell.getAudioUrl', {}, cont);
      },
      isMuted: function(cont) {
        m('wadokei.bell.isMuted', {}, cont);
      },
      mute: function(cont) {
        m('wadokei.bell.mute', {}, cont);
      },
      unmute: function(cont) {
        m('wadokei.bell.unmute', {}, cont);
      },
      ring: function(times, cont) {
        m('wadokei.bell.ring', {times:times}, cont);
      }
    },
    sun : {
      setLatLon: function(lat, lon, cont) {
        m('wadokei.sun.setLatLon', {lat:lat,lon:lon}, cont);
      },
      getLatitude: function(cont) {
        m('wadokei.sun.getLatitude', {}, cont);
      },
      getLongitude: function(cont) {
        m('wadokei.sun.getLongitude', {}, cont);
      }
    },
    ui : {
      getStyle: function(cont) {
        m('wadokei.ui.getStyle', {}, cont);
      },
      setStyle: function(style,cont) {
        m('wadokei.ui.setStyle', {style:style}, cont);
      },
      getFormat: function(cont) {
        m('wadokei.ui.getFormat', {}, cont);
      },
      setFormat: function(format,cont) {
        m('wadokei.ui.setFormat', {format:format}, cont);
      }
    }
  };
}) ();

document.addEventListener('DOMContentLoaded', function () {
  var $ = function(n) { return document.getElementById(n) };

  var latlonInput = function(field, dir, info) {
    var value;
    var degs = function(x,q) {
      var nlen = function(x,n) {
        x = String(x);
        while (x.length < n) x = ' '+x;
        return x;
      }
      var a = Math.abs(x);
      var s = nlen(0|a, 3) + '\u00b0 ';
      s += nlen(0|(a*60)%60, 2) + '\u2032 ';
      s += nlen(0|(a*3600+.5)%60, 2) + '\u2033 ';
      return s +' '+ dir.charAt(x>=0) +'  ';
    };
    var parse = function(str) {
      var r;
      if (str.match(/^[+-]?[0-9]{0,3}(?:\.[0-9]*)?$/))
        return parseFloat(str);
      if (r=str.match(/^\s*([+-])?\s*([0-9.]+)\W*(?:([0-9.]+)\W*(?:([0-9.]+)\W*)?)?([NSWE])?\s*$/i))
      {
        var x = 0;
        if (r[4]) { x /= 60; x += parseFloat(r[4]); } // ″
        if (r[3]) { x /= 60; x += parseFloat(r[3]); } // ′
        if (r[2]) { x /= 60; x += parseFloat(r[2]); } // °
        if (r[5]) x *= [1,-1][(r[5].charCodeAt(0)>>4)&1]; // +-
        if (r[1]) x *= [-1,1][(r[1].charCodeAt(0)>>1)&1]; // NSWE
        return x;
      }
      throw "Invalid format";
    }
    var update = function() {
      try {
        value = parse(field.value);
      }
      catch (ex) {
        console.log(ex);
      }
      switch (dir) {
        case 'SN':
          if (value > 90) value = 90;
          if (value < -0) value =-90;
          if (Math.abs(value) > 66.562)
            info.innerHTML = 'Warning: Clock will NOT work during the polar day and polar night!';
          else
            info.innerHTML = '';
          break;
        case 'WE':
          value = (360 + (value + 180) % 360) % 360 - 180;
          break;
      }
      field.value = degs(value);
    }
    field.addEventListener('blur', update);
    this.set = function(number) {
      field.value = degs(value = Number(number));
    }
    this.get = function() {
      update();
      return value;
    }
    this.info = info;
  };

  var lat = new latlonInput($('lat'), 'SN', $('lat-info'));
  var lon = new latlonInput($('lon'), 'WE', $('lon-info'));
  var url = $('url');
  var style = $('style');
  var mute = $('mute');
  var format = $('format');

  wadokei.sun.getLatitude(function(x) { lat.set(x.retval) });
  wadokei.sun.getLongitude(function(x) { lon.set(x.retval) });
  wadokei.bell.getAudioUrl(function(x) { url.value = x.retval });
  wadokei.ui.getStyle(function(x) { style.value = x.retval });
  wadokei.ui.getFormat(function(x) { format.value = x.retval });

  $('tzlon').addEventListener('click', function() {
    lon.set(- new Date().getTimezoneOffset() / 4);
  });
  $('edolat').addEventListener('click', function() {
    lat.set(35.689506);
    lon.set(139.6917);
  });
  $('belldefault').addEventListener('click', function() {
    url.value = ''
  });

  mute.disabled = true;
  wadokei.bell.isMuted(function(x) {
    mute.value = ['Mute', 'Unmute'][Number(mute.muted = x.retval)];
    mute.disabled = false;
  });
  mute.addEventListener('click', function() {
    mute.value = ['Mute', 'Unmute'][Number(mute.muted = !mute.muted)];
    mute.disabled = true;
    var orgval = mute.value;
    mute.value = 'Saving...';
    [wadokei.bell.unmute,wadokei.bell.mute][Number(mute.muted)](function() {
      mute.value = 'Saved';
      wadokei.bell.isMuted(function(x) {
        mute.value = ['Mute', 'Unmute'][Number(mute.muted = x.retval)];
        mute.disabled = false;
      });
    });
  });

  $('ring').addEventListener('click', function() {
    wadokei.bell.getAudioUrl(function(x) {
      var p = function() {
        wadokei.bell.ring(1, function(r) {
          if (r.error) {
            console.log(r);
            alert("Error: "+r.error.code);
          }
        });
      };
      if (url.value != x.retval)
        wadokei.bell.setAudioUrl(url.value, p);
      else
        p();
    });
  });

  $('save').addEventListener('click', function() {
    var button = this;
    var orgval = button.value;
    button.value = 'Saving...';
    button.disabled = true;
    var ready = 0;
    var check = function() {
      if (!--ready) {
        button.value = 'Saved';
        setTimeout(function() {
          button.value = orgval;
          button.disabled = false;
        }, 1000);
      }
    };
    ready++; wadokei.sun.setLatLon(lat.get(), lon.get(), check);
    ready++; wadokei.bell.setAudioUrl(url.value, check);
    ready++; wadokei.ui.setStyle(style.value, check);
    ready++; wadokei.ui.setFormat(format.value, check);
  });

});
