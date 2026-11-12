/*
 * Unifesto register embed (K21).
 *
 *   <script src="https://www.unifesto.app/embed.js" async></script>
 *   <a href="https://www.unifesto.app/event/<slug>/register" data-unifesto-event>Register</a>
 *
 * The link works without this script. With it, Register opens checkout in a
 * popup (or the same tab where popups are blocked), and once the person is
 * registered this page gets a "unifesto:registered" event:
 *
 *   window.addEventListener("unifesto:registered", (e) => console.log(e.detail.event));
 *
 * That event is a hint for your page, not proof: anyone can trigger it by
 * opening #unifesto=registered. To trust a registration, use webhooks.
 */
(function () {
  if (window.__unifestoEmbed) return;
  window.__unifestoEmbed = true;

  var KEY = "unifesto:registered";
  var channel = null;
  try {
    channel = new BroadcastChannel("unifesto");
  } catch {
    /* old browser: the storage event below carries it instead */
  }

  function fire(detail) {
    window.dispatchEvent(new CustomEvent(KEY, { detail: detail }));
  }

  // 1. The way back: this page loaded with #unifesto=registered after checkout.
  var hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get("unifesto") === "registered") {
    var detail = { event: hash.get("event") };
    history.replaceState(null, "", location.pathname + location.search);
    if (hash.get("popup") === "1") {
      // We're the popup: tell the tab that opened us (same site), then close.
      if (channel) channel.postMessage(detail);
      else
        try {
          localStorage.setItem(KEY, JSON.stringify({ event: detail.event, at: Date.now() }));
        } catch {
          /* storage blocked */
        }
      setTimeout(function () {
        window.close();
      }, 300);
    } else {
      fire(detail); // same tab: checkout ran here
    }
  }

  // 2. A popup from this page finished.
  if (channel)
    channel.onmessage = function (e) {
      fire(e.data);
    };
  else
    window.addEventListener("storage", function (e) {
      if (e.key === KEY && e.newValue) fire({ event: JSON.parse(e.newValue).event });
    });

  // 3. Register clicks open checkout in a popup, tagged with this site.
  function tag(v) {
    return v.toLowerCase().replace(/[^a-z0-9_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[data-unifesto-event]") : null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var url;
    try {
      url = new URL(a.href);
    } catch {
      return;
    }
    var q = url.searchParams;
    q.set("embed", "1");
    q.set("return", location.href.split("#")[0]);
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
