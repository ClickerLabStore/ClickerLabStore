(() => {
    const form = document.getElementById('bundle-customize');
    if (!form) return;
    const button = document.getElementById('bundle-add');
    const status = document.getElementById('bundle-stock-status');
    let busy = false;
    const selection = () => [...form.querySelectorAll('.bundle-clicker')].map(field => ({
        productId: `${field.dataset.size}-key-clicker`,
        switchType: field.querySelector('.bundle-switch').value,
        keycaps: [...field.querySelectorAll('.bundle-keycap')].map(s => Number(s.value))
    }));
    function update() {
        const ready = window.ClickerInventory.ready();
        button.disabled = busy || !ready;
        status.textContent = ready ? 'Stock is checked again before adding your bundle.' : 'Unable to check inventory. Please refresh before adding your bundle.';
        for (const select of form.querySelectorAll('.bundle-keycap')) {
            for (const option of select.options) {
                if (!option.value) continue;
                const stock = window.ClickerInventory.available(Number(option.value));
                option.disabled = !ready || stock === 0;
                option.textContent = `Keycap ${option.value}${ready ? ` (${stock} available)` : ''}`;
            }
        }
    }
    form.addEventListener('change', event => {
        if (!event.target.matches('.bundle-keycap')) return;
        const image = event.target.parentElement.querySelector('img');
        image.hidden = !event.target.value;
        if (event.target.value) {
            image.src = `/keycap-${event.target.value}.png`;
            image.alt = `Keycap ${event.target.value}`;
        }
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || !form.reportValidity()) return;
        const item = {productId:form.dataset.bundle,name:form.dataset.name,price:Number(form.dataset.price),
            image:form.dataset.image,quantity:Number(document.getElementById('bundle-quantity').value),
            options:{clickers:selection()}};
        busy = true; update();
        try {
            if (await window.ClickerCart.addItem(item)) status.textContent = 'Bundle added to your cart.';
        } finally { busy = false; button.disabled = !window.ClickerInventory.ready(); }
    });
    window.addEventListener('clickerlab-inventory-change', update);
    window.ClickerInventory.refresh().catch(() => {});
})();
