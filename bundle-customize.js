(() => {
    const form = document.getElementById('bundle-customize');
    if (!form) return;
    const button = document.getElementById('bundle-add');
    const status = document.getElementById('bundle-stock-status');
    const picker = document.createElement('dialog');
    picker.className = 'bundle-picker';
    picker.setAttribute('aria-labelledby','bundle-picker-title');
    picker.innerHTML = '<div class="bundle-picker-header"><h2 id="bundle-picker-title">Choose a keycap</h2><button type="button" class="bundle-picker-close" aria-label="Close keycap picker">×</button></div><div class="bundle-picker-grid"></div>';
    document.body.appendChild(picker);
    let activeSlot = null;
    let busy = false;
    const slots = () => [...form.querySelectorAll('.bundle-keycap')];
    const complete = () => slots().every(slot => slot.dataset.keycap);
    const selection = () => [...form.querySelectorAll('.bundle-clicker')].map(field => ({
        productId: `${field.dataset.size}-key-clicker`,
        switchType: field.querySelector('.bundle-switch.selected').dataset.switch,
        keycaps: [...field.querySelectorAll('.bundle-keycap')].map(s => Number(s.dataset.keycap))
    }));
    function buildPicker() {
        const grid = picker.querySelector('.bundle-picker-grid');
        grid.replaceChildren();
        const quantity = Math.max(1, Number(document.getElementById('bundle-quantity').value) || 1);
        for (let id=1; id<=11; id++) {
            const used = slots().filter(s => s !== activeSlot && Number(s.dataset.keycap) === id).length;
            const available = Math.max(0,window.ClickerInventory.available(id) - used*quantity);
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'bundle-picker-option' + (Number(activeSlot.dataset.keycap)===id ? ' selected':'');
            option.disabled = !window.ClickerInventory.ready() || available < quantity;
            option.setAttribute('aria-label',`Keycap ${id}, ${available} available`);
            option.setAttribute('aria-pressed',String(Number(activeSlot.dataset.keycap)===id));
            option.innerHTML = `<img src="/keycap-${id}.png" alt="Keycap ${id}"><span>Keycap ${id} · ${option.disabled?'Unavailable':available+' available'}</span>`;
            option.addEventListener('click',() => {
                activeSlot.dataset.keycap = String(id);
                activeSlot.classList.add('selected');
                activeSlot.querySelector('.bundle-slot-preview').innerHTML = `<img src="/keycap-${id}.png" alt="Keycap ${id}">`;
                activeSlot.querySelector('.bundle-slot-label').textContent = `Keycap ${id}`;
                activeSlot.setAttribute('aria-label',`${activeSlot.closest('fieldset').querySelector('legend').textContent}, key ${slots().filter(s=>s.closest('fieldset')===activeSlot.closest('fieldset')).indexOf(activeSlot)+1}: Keycap ${id}, change keycap`);
                picker.close(); update();
            });
            grid.appendChild(option);
        }
    }
    function update() {
        const ready = window.ClickerInventory.ready();
        button.disabled = busy || !ready || !complete();
        status.textContent = ready ? (complete() ? 'Stock is checked again before adding your bundle.' : 'Choose a keycap for every key to add your bundle.') : 'Unable to check inventory. Please refresh before adding your bundle.';
        if (picker.open) buildPicker();
    }
    form.addEventListener('click',event => {
        const switchButton = event.target.closest('.bundle-switch');
        if (switchButton) {
            switchButton.parentElement.querySelectorAll('button').forEach(b => {
                b.classList.toggle('selected',b===switchButton);
                b.setAttribute('aria-pressed',String(b===switchButton));
            });
        }
        const slot = event.target.closest('.bundle-keycap');
        if (slot) {
            activeSlot = slot;
            picker.querySelector('h2').textContent = `${slot.closest('fieldset').querySelector('legend').textContent}: Choose a keycap`;
            buildPicker(); picker.showModal();
            window.ClickerInventory.refresh().catch(()=>{});
        }
    });
    picker.querySelector('.bundle-picker-close').addEventListener('click',()=>picker.close());
    picker.addEventListener('click',event=>{if(event.target===picker){const r=picker.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)picker.close();}});
    picker.addEventListener('close',()=>activeSlot?.focus());
    document.getElementById('bundle-quantity').addEventListener('input',update);
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || !complete() || !form.reportValidity()) return;
        const item = {productId:form.dataset.bundle,name:form.dataset.name,price:Number(form.dataset.price),
            image:form.dataset.image,quantity:Number(document.getElementById('bundle-quantity').value),
            options:{clickers:selection()}};
        busy = true; update();
        try {
            if (await window.ClickerCart.addItem(item)) status.textContent = 'Bundle added to your cart.';
        } finally { busy = false; button.disabled = !window.ClickerInventory.ready() || !complete(); }
    });
    window.addEventListener('clickerlab-inventory-change', update);
    window.ClickerInventory.refresh().catch(() => {});
})();
