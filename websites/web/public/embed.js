/*
 * Unifesto register embed (K21).
 *
 *   <script src="https://www.unifesto.app/embed.js" async></script>
 *   <a href="https://www.unifesto.app/event/<slug>/register" data-unifesto-event>Register</a>
 *
 * The link works without this script. With it, Register opens checkout in a
 * popup (or the same tab where popups are blocked), and when the person comes
 * back registered, this page gets a "unifesto:registered" event:
 *
 *   window.addEventListener("unifesto:registered", (e) => console.log(e.detail.event));
 *   // Loaded late? The last one is also in window.unifestoRegistered.
 *
 * The event fires in every open tab of your site, and it is a hint for your
 * page, not proof: anyone can trigger it by opening #unifesto=registered. Treat
 * e.detail.event as text. To trust a registration, use webhooks.
 */
(function () {
  if (window.__unifestoEmbed) return;
  window.__unifestoEmbed = true;

  var KEY = "unifesto:registered";
  var SLUG = /^[a-z0-9-]{1,120}$/i;
  var channel = null;
  try {
    channel = new BroadcastChannel("unifesto");
  } catch {
    /* old browser: the storage event below carries it instead */
  }

  function fire(event) {
    if (typeof event !== "string" || !SLUG.test(event)) return;
    var detail = { event: event };
    window.unifestoRegistered = detail;
    var go = function () {
      window.dispatchEvent(new CustomEvent(KEY, { detail: detail }));
    };
    // Listeners added while the page is still loading get it too.
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }

  // 1. The way back: this page loaded with #unifesto=registered after checkout.
  var hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get("unifesto") === "registered") {
    var event = hash.get("event");
    history.replaceState(null, "", location.pathname + location.search);
    if (hash.get("popup") === "1") {
      // We're the popup: tell the tab that opened us (same site), then close.
      if (channel) channel.postMessage({ event: event });
      else
        try {
          localStorage.setItem(KEY, JSON.stringify({ event: event, at: Date.now() }));
        } catch {
          /* storage blocked */
        }
      setTimeout(function () {
        window.close();
        // Still open (the browser refused): this page is where they are now.
        setTimeout(function () {
          fire(event);
        }, 300);
      }, 300);
    } else {
      fire(event); // same tab: checkout ran here
    }
  }

  // 2. A popup from this site finished.
  if (channel)
    channel.onmessage = function (e) {
      fire(e.data && e.data.event);
    };
  else
    window.addEventListener("storage", function (e) {
      if (e.key !== KEY || !e.newValue) return;
      try {
        fire(JSON.parse(e.newValue).event);
      } catch {
        /* not ours */
      }
    });

  // 3. Register clicks open checkout in a popup, tagged with this site.
  function tag(v) {
    return v.toLowerCase().replace(/[^a-z0-9_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[data-unifesto-event]") : null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // Inside someone else's frame (a site builder's widget), popups and the
    // way back can't work: let the link open in a new tab instead.
    if (window.top !== window) {
      a.target = "_blank";
      return;
    }
    var url;
    try {
      url = new URL(a.href);
    } catch {
      return;
    }
    // Only Unifesto event links (any host: spaces have their own domains).
    if (!/^\/event\/[^/]+(\/register)?\/?$/.test(url.pathname)) return;
    var q = url.searchParams;
    q.set("embed", "1");
    // This page without its query (tokens, emails and ad ids stay here).
    q.set("return", location.origin + location.pathname);
    if (!q.get("utm_source")) q.set("utm_source", tag(location.hostname.replace(/^www\./, "")));
    if (!q.get("utm_medium")) q.set("utm_medium", "embed");
    q.set("popup", "1");
    var w = window.open(url.toString(), "unifesto-register", "popup,width=480,height=760");
    e.preventDefault();
    if (w) return;
    // Popups blocked (or an in-app browser): check out in this tab and come back.
    q.delete("popup");
    location.href = url.toString();
  });
})();
