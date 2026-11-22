(function () {
  var el = document.getElementById('contactLine');
  if (!el) return;
  var c = window.NOVINET_SITE || {};
  var nodes = [];
  if (c.whatsapp) {
    var a = document.createElement('a');
    a.href = 'https://wa.me/' + String(c.whatsapp).replace(/[^0-9]/g, '');
    a.dir = 'ltr';
    a.textContent = String(c.whatsapp);
    nodes.push(document.createTextNode('واتساب: '), a);
  }
  if (c.email) {
    var sp = document.createElement('span');
    sp.dir = 'ltr';
    sp.textContent = String(c.email);
    if (nodes.length) nodes.push(document.createElement('br'));
    nodes.push(document.createTextNode('الإيميل: '), sp);
  }
  if (!nodes.length) {
    el.textContent = 'لم تُنشر وسيلة تواصل بعد لأن النسخة تجريبية؛ ستظهر هنا قبل الإطلاق الرسمي.';
    return;
  }
  el.replaceChildren.apply(el, nodes);
})();
