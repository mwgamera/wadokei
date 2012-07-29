var wadokei = (function() {

  // Bell playing a sound at regular intervals
  var bell = function() {

    // Bell configuration defaults
    var default_bell = "bell.ogg";
    localStorage['bell_play'] || (localStorage.bell_play = "true");
    localStorage['bell_url']  || (localStorage.bell_url = default_bell);

    // Stack of identical Audio elements that can be played simultaneously
    var pool = function() {
      var queue;
      var setup = function(a) {
        queue = a;
        a.startTime = 0;
        a.addEventListener('ended', function() { push(this) });
      };
      var pop = function() {
        var a = queue;
        if (a.next)
          queue = a.next;
        else
          setup(a.cloneNode());
        return a;
      };
      var push = function(a) {
        if (a !== queue && a.src == queue.src) {
          a.next = queue;
          queue = a;
        }
      };
      return {
        setup : setup,
        get : pop,
        // automatically pushed back on ended
        src : function() { return queue.src }
      };
    } ();

    pool.setup(new Audio(localStorage.bell_url));

    var ring = function(times, delay) {
      var a = pool.get();
      if (a.error)
        throw a.error;
      a.play();
      if (--times > 0)
        setTimeout(function() {
          ring(times, delay)
        }, delay);
    };

    return {
      ring : function(times, delay) {
        if (localStorage.bell_play == "true")
          ring(times, delay || 1000);
      },

      // Do not use localStorage directly,
      // for consistency always use these to configure bell
      setAudioUrl : function(url) {
        pool.setup(new Audio(localStorage.bell_url = url || default_bell));
      },
      getAudioUrl : function() {
        return pool.src();
      },
      isMuted : function() {
        return localStorage.bell_play != "true";
      },
      mute : function() {
        localStorage.bell_play = "false";
      },
      unmute : function() {
        localStorage.bell_play = "true";
      }
    };
  } ();

  // Sunrise/sunset algorithm
  var sun = function() {

    // Location defaults (Edo, now: Tokyo)
    var lat = parseFloat(localStorage['latitude']  || (localStorage.latitude = "35.689506"));
    var lon = parseFloat(localStorage['longitude'] || // (localStorage.longitude = "139.6917"));
        (localStorage.longitude = - new Date().getTimezoneOffset() / 4));

    var latRad = lat * Math.PI / 180;

    // Cache last N values
    var cache = function(N) {
      var data = {};
      var last = [];
      return {
        get : function(i) { return data[i]; },
        set : function(i,c) {
          data[i] = c;
          last.push(i);
          if (last.length > N)
            delete data[last.shift()];
          return c;
        },
        clear : function() {
          data = {};
          last = [];
        }
      };
    } (6);

    // Algorithm core
    var suntime = function() {
      var meanlong = function(t) {
        var l = 5.2918382920468073E-6;
        l *= t; l += 628.3319667861392;
        l *= t; l += 4.895063168412976;
        return l;
      };
      var meananomaly = function(t) {
        var m = -2.6825710603152847E-6;
        m *= t; m += 628.3019551515195;
        m *= t; m += 6.240060141224984;
        return m;
      }
      var obliquity = function(t) {
        var e0 = 8.7896720385158861E-9;
        e0 *= t; e0 -= 2.8604007185462624E-9;
        e0 *= t; e0 -= 2.2696552481142927E-4;
        e0 *= t; e0 += 0.40909280422233;
        var o = 2.18235969669371 - 33.75704138135305 * t;
        return e0 + 4.4680428851054839E-5 * Math.cos(o);
      }
      var eqtime = function(t, l0, m, eps)
      {
        var e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
        var y = Math.tan(eps/2); y *= y;
        var sinm   = Math.sin(m);
        var eq = y * Math.sin(2*l0)
          - 2.0 * e * sinm
          + 4.0 * e * y * sinm * Math.cos(2*l0)
          - 0.5 * y * y * Math.sin(4*l0)
          - 1.25 * e * e * Math.sin(2*m);
        return eq * 720 / Math.PI;
      }
      var sunriseHA = function(lat, t, o, m, e) {
        var cosz = -0.014543897651583; // 90°50′
        var x = 2.4434609527920616E-7;
        x *= t; x -= 8.4072510068566855E-5;
        x *= t; x += 0.033416108765268;
        o += x * Math.sin(m);
        x = -1.7627825445142727E-6;
        x *= t; x += 3.4894367735122632E-4;
        o += x * Math.sin(m+m);
        o += 5.0440015382636125E-6 * Math.sin(m+m+m);
        o -= 9.9309234438477346E-5;
        x = -33.75704138135305;
        x *= t; x += 2.18235969669371;
        o -= 8.3426738245328961E-5 * Math.sin(x);
        var sd = Math.asin(Math.sin(e) * Math.sin(o));
        var HAarg = cosz / (Math.cos(lat)*Math.cos(sd))
          - Math.tan(lat) * Math.tan(sd);
        return Math.acos(HAarg)
      }

      // Iterate over successive approximations
      return function(u,q) { // q=-1 sunrise, q=0 transit, q=1 sunset
        var ux = u % 86400000, up = -1;
        var u0 = u - ux; ux /= 60000;
        var c = cache.get([q,u0]);
        if (c) return c;

        var t, t0 = (u0/9131250 - 103680) / 345600;
        var l0, ma, ec;

        while (Math.abs(ux-up) > 0.006) {
          up = ux, t = t0 + ux / 52596000;
          l0 = meanlong(t);
          ma = meananomaly(t);
          ec = obliquity(t);
          ux = sunriseHA(latRad, t, l0, ma, ec) / Math.PI;
          ux = 1 + q*ux;
          ux *= 180; ux -= lon; ux *= 4;
          ux -= eqtime(t, l0, ma, ec);
        }

        return cache.set([q,u0], u0 + 60000 * ux);
      };
    } ();

    var sunrise = function(u) { return suntime(u,-1); };
    var sunset  = function(u) { return suntime(u, 1); };

    return {
      shift   : function(ref) { return Number(ref) + lon * 240000; },
      // Four interesting points determining time scale
      currise : function(ref) { return sunrise(Number(ref)); },
      curset  : function(ref) { return sunset (Number(ref)); },
      nextrise: function(ref) { return sunrise(Number(ref)+86400000); },
      prevset : function(ref) { return sunset (Number(ref)-86400000); },
      // Configuration
      setLatLon : function(latitude, longitude) {
        lon = localStorage.longitude = longitude;
        lat = localStorage.latitude = latitude;
        latRad = lat * Math.PI / 180
        cache.clear();
      },
      getLatitude : function() {
        return lat;
      },
      getLongitude : function() {
        return lon;
      }
    };
  } ();

  // Time scale
  var time = function() {

    var scaleinfo = function(date) {
      var dx = sun.shift(date);
      var info = {};
      if (date < sun.curset(dx)) {
        if (date >= sun.currise(dx)) {
          // 明け六ツの正刻〜暮れ六ツの正刻（昼間）
          info.t0 = sun.currise(dx); info.f0 = 3;
          info.t1 = sun.curset(dx);  info.f1 = 9;
          info.t = 1;
        }
        else { // 〜明け六ツの正刻（朝）
          info.t0 = sun.prevset(dx); info.f0 = -3;
          info.t1 = sun.currise(dx); info.f1 =  3;
          info.t = 0;
        }
      }
      else { // 〜明け六ツの正刻（朝）
        info.t0 = sun.curset(dx);   info.f0 = 9;
        info.t1 = sun.nextrise(dx); info.f1 = 15;
        info.t = 2;
      }
      info.td = info.t1 - info.t0;
      info.fd = info.f1 - info.f0;
      info.r = info.td / info.fd;
      return info;
    }

    var hour = function(date) {
      var o = scaleinfo(date = Number(date || new Date()));
      var f = o.f0 + (date - o.t0) / o.r;
      return (12.5 + f % 12) % 12;
    }
    var next = function(date) {
      var o = scaleinfo(date = Number(date || new Date()));
      var f = o.f0 + (date - o.t0) / o.r;
      var t = ((0|(f*4)+1)/4 - o.f0) * o.r + o.t0;
      return t-date + 100;
    }
    var hourNumber = function(hour) {
      return [9,8,7,6,5,4][0|hour%6];
    }

    var juunishi = function(hour) { // 十二支
      // 子丑寅卯辰巳午未申酉戌亥
      var c ='\u5B50\u4E11\u5BC5\u536F\u8FB0\u5DF3\u5348\u672A\u7533\u9149\u620C\u4EA5';
      return c.charAt(0|hour);
    }
    var jikkan = function(hour, date, d0) { // 十干
      var o = scaleinfo(date = Number(date || new Date()));
      if (!o.t) {
        var f = -(o.f0+.5)*o.r+o.t0;
        f -= 1342828800000;
        f /= 86400000;
        f = 0 | f % 5;
        f = (10 + (f * 12 + hour) % 10) % 10;
        // 甲乙丙丁戊己庚辛壬癸
        return '\u7532\u4E59\u4E19\u4E01\u620A\u5DF1\u5E9A\u8F9B\u58EC\u7678'.charAt(f);
      }
      if (o.t == 2 && hour < 6)
        return jikkan(hour, date + 43200000, date);
      date = sun.shift(date);
      return jikkan(hour, (sun.currise(date)*2+sun.prevset(date))/3, date);
    }
    var frac = function(hour) {
      // '初二三四'
      return '\u521D\u4E8C\u4E09\u56db'.charAt(0|(4*hour)%4);
      // '一二三四'
      return '\u4E00\u4E8C\u4E09\u56db'.charAt(0|(4*hour)%4);
    }

    return {
      // Numeric info
      hour: hour,
      hourNumber: hourNumber,
      next: next,
      // Named time
      juunishi: juunishi,
      jikkan: jikkan,
      frac: frac,
      kanji: function(date) {
        var hr = hour(date);
        return [jikkan(hr,date), juunishi(hr), frac(hr)];
      }
    };
  } ();

  // User interface
  var ui = function() {
    var style = localStorage['style']  || (localStorage.style = "black");
    var timer = null;
    var init = function() {
      clearTimeout(timer);
      update();
      /*
      chrome.browserAction.onClicked.addListener(function() {
        chrome.tabs.create({url:chrome.extension.getURL('options.html')});
        return false;
      });
      */
    }
    var tokisoba = [
      "\u771F\u591C\u4E5D\u30C4",
      "\u591C\u516B\u30C4",
      "\u6681\u4E03\u30C4",
      "\u660E\u30B1\u516D\u30C4",
      "\u671D\u4E94\u30C4",
      "\u663C\u56DB\u30C4",
      "\u771F\u663C\u4E5D\u30C4",
      "\u663C\u516B\u30C4",
      "\u5915\u4E03\u30C4",
      "\u66AE\u30EC\u516D\u30C4",
      "\u5BB5\u4E94\u30C4",
      "\u591C\u56DB\u30C4"
    ];
    var update = function() {
      var hour = time.hour();
      var kanji = time.kanji();
      var title = tokisoba[0|hour]+'\u30FB'+kanji[0]+kanji[1]+'\u30CE'+kanji[2]+'\u523B';
      
      chrome.browserAction.setIcon({path:'gfx/'+style+'/'+(0|hour)+'.png'});
      chrome.browserAction.setTitle({title:title});

      if (Math.abs(hour-(0|hour)-0.5) < 0.01)
        bell.ring(time.hourNumber(hour));
      timer = setTimeout(update, time.next());
    }
    return {
      init: init,
      setStyle : function(s) {
        style = localStorage.style = s.replace(/[^a-z0-9_-]/gi,"");
        init();
      },
      getStyle : function() {
        return style;
      }
    };
  } ();

  // Expose configuration through RPC-like interface
  chrome.extension.onMessage.addListener(
    function(request, sender, sendResponse) {
      try {
        switch (request.type) {
          // bell
          case 'wadokei.bell.setAudioUrl':
            return sendResponse({retval:bell.setAudioUrl(request.url)});
          case 'wadokei.bell.getAudioUrl':
            return sendResponse({retval:bell.getAudioUrl()});
          case 'wadokei.bell.isMuted':
            return sendResponse({retval:bell.isMuted()});
          case 'wadokei.bell.mute':
            return sendResponse({retval:bell.mute()});
          case 'wadokei.bell.unmute':
            return sendResponse({retval:bell.unmute()});
          case 'wadokei.bell.ring':
            return sendResponse({retval:bell.ring(request.times)});
          // sun
          case 'wadokei.sun.setLatLon':
            return sendResponse({retval:sun.setLatLon(request.lat, request.lon)});
          case 'wadokei.sun.getLatitude':
            return sendResponse({retval:sun.getLatitude()});
          case 'wadokei.sun.getLongitude':
            return sendResponse({retval:sun.getLongitude()});
          // ui
          case 'wadokei.ui.getStyle':
            return sendResponse({retval:ui.getStyle()});
          case 'wadokei.ui.setStyle':
            return sendResponse({retval:ui.setStyle(request.style)});
          // default
          default:
            console.log('Received message of unknown type '+request.type);
            return sendResponse({error:"Unknown type"});
        }
      }
      catch (ex) { sendResponse({error:ex}); }
    });

  return {
    bell: bell,
    sun: sun,
    time: time,
    ui: ui
  };
})();

document.addEventListener('DOMContentLoaded', wadokei.ui.init);
