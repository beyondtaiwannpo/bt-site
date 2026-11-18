// /history/ 的牌子：平面貼 canvas 的字（英文大字、中文小字），三支模組共用；不 import three。face 0 面向 +z、π 面向 -z、-π/2 面向 -x；
// opt：size、align "center"、arrow、both（雙面）、flat（平躺，face 變繞 y 的角度）、parent。
export function makeSign(THREE, { textTexture, lam, P, fonts, parent }) {
  const han = fonts.han || fonts.display, cache = new Map();
  return function sign(en, zh, w, h, bg, fg, x, y, z, face, opt) {
    const o = opt || {}; const key = [en, zh, bg, fg, o.size || 0, o.align || "", o.arrow || ""].join("|");
    let tex = cache.get(key);
    if (!tex) {
      const W = 1024, H = Math.max(64, Math.round(1024 * h / w)), size = o.size || Math.round(H * 0.42), cx = o.align === "center" ? W / 2 : 36;
      const lines = zh ? [{ text: en, x: cx, y: H * 0.36, font: `700 ${size}px ${fonts.display}`, color: fg, align: o.align || "left" }, { text: zh, x: cx, y: H * 0.76, font: `900 ${Math.round(size * 0.55)}px ${han}`, color: fg, align: o.align || "left" }]
        : [{ text: en, x: cx, y: H / 2, font: `700 ${size}px ${fonts.display}`, color: fg, align: o.align || "left" }];
      if (o.arrow) lines.push({ text: o.arrow, x: W - 36, y: H / 2, font: `700 ${Math.round(H * 0.6)}px ${fonts.display}`, color: fg, align: "right" });
      tex = textTexture(W, H, bg, lines); cache.set(key, tex);
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lam(P.white, { map: tex, side: o.both ? THREE.DoubleSide : THREE.FrontSide })); m.position.set(x, y, z);
    if (o.flat) { m.rotation.x = -Math.PI / 2; m.rotation.z = face || 0; } else m.rotation.y = face || 0;
    m.castShadow = false; m.receiveShadow = false; (o.parent || parent).add(m); return m;
  };
}
