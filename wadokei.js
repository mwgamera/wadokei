var wadokei = (function() {
  "use strict";

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
    var Cache = function(N) {
      var data = {};
      var last = [];
      this.get = function(i) { return data[i]; };
      this.set = function(i,c) {
        data[i] = c;
        last.push(i);
        if (last.length > N)
          delete data[last.shift()];
        return c;
      };
      this.clear = function() {
        data = {};
        last = [];
      };
    };
    var cache = new Cache(6);

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
      };
      var obliquity = function(t) {
        var e0 = 8.7896720385158861E-9;
        e0 *= t; e0 -= 2.8604007185462624E-9;
        e0 *= t; e0 -= 2.2696552481142927E-4;
        e0 *= t; e0 += 0.40909280422233;
        var o = 2.18235969669371 - 33.75704138135305 * t;
        return e0 + 4.4680428851054839E-5 * Math.cos(o);
      };
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
      };
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
      };

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
  var WaTime = function() {

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
    };

    var hour = function(o, date) {
      var f = o.f0 + (date - o.t0) / o.r;
      return (12.5 + f % 12) % 12;
    };
    var next = function(o, date) {
      var f = o.f0 + (date - o.t0) / o.r;
      var t = ((0|(f*4)+1)/4 - o.f0) * o.r + o.t0;
      return t-date + 100;
    };

    var stem = function(hour, date) {
      var o = scaleinfo(date = Number(date || new Date()));
      if (!o.t) {
        var f = -(o.f0+.5)*o.r+o.t0;
        f -= 1342828800000;
        f /= 86400000;
        f = 0 | f % 5;
        f = (10 + (f * 12 + hour) % 10) % 10;
        return f;
      }
      if (o.t == 2 && hour < 6)
        return stem(hour, date + 43200000);
      date = sun.shift(date);
      return stem(hour, (sun.currise(date)*2+sun.prevset(date))/3);
    };

    // constructor
    var WaTime = function(date) {
      var o = scaleinfo(date = Number(date || new Date()));
      if (!o.td) throw "No sunrise or sunset";
      this.hour = hour(o, date);
      this.hourNumber = [9,8,7,6,5,4][0|(6+(this.hour-.5)%6)%6];
      this.stem = stem(this.hour, date);
      this.next = function(fun) {
        return setTimeout(fun, next(o, date));
      };
    };

    return WaTime;
  } ();

  // Formatter
  WaTime.prototype.format = function() {
    var numspell = function(x) {
      if (x>0.5 && x<0.75) return "\u6b63\u5b50"; // 正子
      if (x>6.5 && x<6.75) return "\u6b63\u5348"; // 正午
      return [
        "\u771f\u591c\u4e5d\u30c4", // 真夜九ツ
        "\u591c\u516b\u30c4",       // 夜八ツ
        "\u6681\u4e03\u30c4",       // 暁七ツ
        "\u660e\u3051\u516d\u30c4", // 明け六ツ
        "\u671d\u4e94\u30c4",       // 朝五ツ
        "\u663c\u56db\u30c4",       // 昼四ツ
        "\u771f\u663c\u4e5d\u30c4", // 真昼九ツ
        "\u663c\u516b\u30c4",       // 昼八ツ
        "\u5915\u4e03\u30c4",       // 夕七ツ
        "\u66ae\u308c\u516d\u30c4", // 暮れ六ツ
        "\u5bb5\u4e94\u30c4",       // 宵五ツ
        "\u591c\u56db\u30c4"        // 夜四ツ
      ][0|(12+(x-.5)%12)%12] +
      (x%1<.5?"\u534a":""); // 半
    };
    var branch = function(x) { // 十二支：子丑寅卯辰巳午未申酉戌亥
      return "\u5b50\u4e11\u5bc5\u536f\u8fb0\u5df3\u5348\u672a\u7533\u9149\u620c\u4ea5".charAt(x);
    };
    var stem = function(x) { // 十干：甲乙丙丁戊己庚辛壬癸
      return "\u7532\u4e59\u4e19\u4e01\u620a\u5df1\u5e9a\u8f9b\u58ec\u7678".charAt(x);
    };
    var ampm = function(x) { // 夜昼
      return "\u591c\u663c".charAt(Number((8.5+x)%12 < 6));
    };
    var frac = function(x) { // 一二三四
      return "\u4e00\u4e8c\u4e09\u56db".charAt(0|(4*x)%4);
    };
    var esc = function(t,x) {
      if (!x.length) return x;
      switch(x) {
        case "H": return 0|t.hour;
        case "M": return 1+(0|(4*t.hour)%4);
        case "T": return numspell(t.hour);
        case "b": return branch(t.hour);
        case "h": return t.hourNumber;
        case "m": return frac(t.hour);
        case "p": return ampm(t.hour);
        case "s": return stem(t.stem);
        default: return "%"+x;
      }
    };
    return function(fmt) {
      var out = "";
      while (fmt.length) {
        var i = fmt.search(/%./);
        if (i < 0)
          return out + fmt;
        out += fmt.substr(0, i);
        out += esc(this, fmt.charAt(++i));
        fmt = fmt.substr(++i);
      }
      return out;
    };
  } ();

  // User interface
  var ui = function() {
    var style = localStorage['style']  || (localStorage.style = "black");
    var format = localStorage['format']  ||
      (localStorage.format = "%T\u30fb%s%b\u306e\u523b%m\u3064\u6642");
    var timer = null;
    var update = function() {
      try {
        var wt = new WaTime();
        var title = wt.format(format);

        chrome.browserAction.setIcon({path:'gfx/'+style+'/'+(0|wt.hour)+'.png'});
        chrome.browserAction.setTitle({title:title});

        if (Math.abs(wt.hour-(0|wt.hour)-0.5) < 0.01)
          bell.ring(wt.hourNumber);
        timer = wt.next(update);
      }
      catch (ex) {
        chrome.browserAction.setIcon({path:'gfx/icon019.png'});
        chrome.browserAction.setTitle({title:String(ex)});
        console.log(ex);
        timer = setTimeout(update, 3600000);
      }
    };
    var init = function() {
      clearTimeout(timer);
      update();
    };
    return {
      init: init,
      setStyle : function(s) {
        style = localStorage.style = s.replace(/[^a-z0-9_-]/gi,"");
        init();
      },
      getStyle : function() {
        return style;
      },
      setFormat: function(fmt) {
        format = localStorage.format = fmt;
        init();
      },
      getFormat: function() {
        return format;
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
          case 'wadokei.ui.getFormat':
            return sendResponse({retval:ui.getFormat()});
          case 'wadokei.ui.setFormat':
            return sendResponse({retval:ui.setFormat(request.format)});
          // default
          default:
            console.log('Received message of unknown type '+request.type);
            return sendResponse({error:"Unknown type"});
        }
      }
      catch (ex) { sendResponse({error:ex}); }
    });

  return {
    WaTime: WaTime,
    bell: bell,
    sun: sun,
    ui: ui
  };
})();

document.addEventListener('DOMContentLoaded', wadokei.ui.init);

