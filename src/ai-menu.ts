// כפתור הלוגו היחיד: מחזיק את כל פעולות המערכת. הפעולות נשלחות כאירוע "ai-action" והאפליקציה מטפלת בהן.
const ITEMS: [string, string][] = [
  ["refresh", "לרענן את הלוח"],
  ["calendar", "לחבר את היומן"],
  ["dests", "לבחור יעדים לסריקה"],
  ["about", "איך זה עובד"],
];

class AiMenu extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
<style>
:host{position:relative;display:inline-block;font-family:inherit}
button{font:inherit;cursor:pointer;border:0;border-radius:0;color:inherit}
.logo{width:40px;height:40px;display:grid;place-items:center;background:#111;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.2);transition:transform .12s,box-shadow .12s}
.logo:hover{transform:translateY(-1px);box-shadow:0 5px 12px rgba(0,0,0,.25)}
.logo:active{transform:translateY(1px);box-shadow:0 1px 2px rgba(0,0,0,.25)}
.logo:focus-visible,.item:focus-visible{outline:2px solid #0a7d4f;outline-offset:2px}
.menu{position:absolute;inset-inline-end:0;top:48px;min-width:210px;background:#fff;box-shadow:0 12px 32px rgba(0,0,0,.18);padding:8px;display:none;z-index:2000}
:host([open]) .menu{display:block}
.item{display:block;width:100%;text-align:start;background:transparent;padding:10px 12px;font-size:15px}
.item:hover{background:#f4f4f2}
</style>
<button class="logo" aria-label="תפריט" aria-haspopup="true">
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"><path d="M21 3 3 10.5l6.5 2.5L12 20z"/><path d="M21 3 9.5 13"/></svg>
</button>
<div class="menu" role="menu">${ITEMS.map(([id, t]) => `<button class="item" role="menuitem" data-id="${id}">${t}</button>`).join("")}</div>`;
    root.querySelector(".logo")!.addEventListener("click", () => this.toggleAttribute("open"));
    root.querySelectorAll<HTMLButtonElement>(".item").forEach((b) =>
      b.addEventListener("click", () => {
        this.removeAttribute("open");
        this.dispatchEvent(new CustomEvent("ai-action", { detail: b.dataset.id, bubbles: true, composed: true }));
      }));
    document.addEventListener("click", (e) => { if (!e.composedPath().includes(this)) this.removeAttribute("open"); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") this.removeAttribute("open"); });
  }
}
if (!customElements.get("ai-menu")) customElements.define("ai-menu", AiMenu);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX { interface IntrinsicElements { "ai-menu": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> } }
}
export {};
