# 🐛 Debug: QR Code Não Foi Gerado

## O que fazer quando aparecer esse erro

### Passo 1: Abrir o Console do Navegador

1. Pressione **F12** para abrir o DevTools
2. Vá na aba **Console**
3. Limpe o console (ícone 🚫 ou Ctrl+L)
4. Tente criar e conectar novamente

### Passo 2: Analisar os Logs

Você deve ver logs como estes:

```
🔄 Criando instância: instance_abc12345
📡 URL: https://service-evolution-api.tnvro1.easypanel.host/instance/create
🔑 API Key: ***abc123
📊 Status da resposta: 201
📦 Resposta: {...}
⏳ Aguardando instância estar pronta...
✅ Instância pronta após 3 tentativa(s)
⏳ Aguardando 2s adicionais para garantir...
📱 Conectando WhatsApp...
📡 URL: https://service-evolution-api.tnvro1.easypanel.host/instance/connect/instance_abc12345
📊 Status da resposta: 200
📦 Resposta completa: {...}
🔍 Procurando QR Code...
   data.base64: true/false
   data.qrcode?.base64: true/false
   data.code: true/false
   data.qr: true/false
```

### Passo 3: Identificar o Problema

#### Cenário A: Status 403 ao conectar
```
📊 Status da resposta: 403
❌ Erro na resposta: Forbidden
```

**Causa:** API Key não tem permissão ou instância não existe
**Solução:**
1. Verifique se está usando a Global API Key
2. Consulte [RESOLVER_403_FORBIDDEN.md](RESOLVER_403_FORBIDDEN.md)

---

#### Cenário B: Status 200 mas QR Code não vem na resposta
```
📊 Status da resposta: 200
📦 Resposta completa: { instance: {...}, state: "close" }
🔍 Procurando QR Code...
   data.base64: false
   data.qrcode?.base64: false
   data.code: false
   data.qr: false
❌ QR Code não encontrado na resposta
```

**Causa:** Instância existe mas não está retornando QR Code
**Possíveis Motivos:**
1. Instância já está conectada (não precisa de QR Code)
2. Instância precisa ser deletada e recriada
3. Evolution API está com problema

**Solução:**
```sql
-- No Supabase, verifique o estado:
SELECT * FROM whatsapp_connections WHERE user_id = 'SEU_USER_ID';
```

Se `instance_exists = true` e `status = 'connected'`:
- A instância JÁ está conectada
- Recarregue a página (F5)
- Deve mostrar "WhatsApp Conectado"

Se `status = 'disconnected'`:
- Tente deletar a instância e recriar

**Deletar instância manualmente:**
```javascript
// No console do navegador:
const instanceName = 'instance_abc12345' // Substitua pelo seu
const apiKey = 'SUA_GLOBAL_API_KEY'
const apiUrl = 'https://service-evolution-api.tnvro1.easypanel.host'

fetch(`${apiUrl}/instance/delete/${instanceName}`, {
  method: 'DELETE',
  headers: { 'apikey': apiKey }
})
.then(r => r.json())
.then(data => console.log('Instância deletada:', data))

// Depois limpe o Supabase:
// DELETE FROM whatsapp_connections WHERE user_id = 'SEU_USER_ID';

// E o localStorage:
localStorage.removeItem('whatsapp_status')
localStorage.removeItem('whatsapp_instance_exists')

// Recarregue a página e tente novamente
```

---

#### Cenário C: Status 404
```
📊 Status da resposta: 404
❌ Erro na resposta: Instance not found
```

**Causa:** Instância não foi criada corretamente
**Solução:**
1. Verifique se a criação teve sucesso (status 201)
2. Se não, veja o erro na criação
3. Pode precisar da Global API Key para criar

---

#### Cenário D: Instância pronta não detectada
```
⏳ Aguardando instância estar pronta...
Tentativa 1 falhou: {...}
Tentativa 2 falhou: {...}
...
Tentativa 10 falhou: {...}
❌ Timeout aguardando instância estar pronta
```

**Causa:** Instância foi criada mas não está respondendo
**Solução:**
1. Verifique se a Evolution API está online
2. Teste manualmente no Postman/Insomnia:
```bash
GET https://service-evolution-api.tnvro1.easypanel.host/instance/connectionState/instance_abc12345
Headers: apikey: SUA_GLOBAL_API_KEY
```

Se retornar 404: Instância não existe
Se retornar 200: Instância existe, mas pode estar com problema

---

### Passo 4: Soluções Rápidas

#### Solução 1: Forçar Reconexão (Se instância existe)

Se você vê que a instância existe mas não conecta:

1. Vá para a Evolution API diretamente
2. URL: `https://service-evolution-api.tnvro1.easypanel.host/manager`
3. Login com suas credenciais
4. Procure sua instância (`instance_abc12345`)
5. Clique em "Connect" ou "QR Code"
6. Copie o QR Code de lá

Ou use a API diretamente:

```javascript
// No console do navegador:
fetch('https://service-evolution-api.tnvro1.easypanel.host/instance/connect/instance_abc12345', {
  headers: { 'apikey': 'SUA_GLOBAL_API_KEY' }
})
.then(r => r.json())
.then(data => {
  console.log('Resposta:', data)
  if (data.base64) {
    console.log('QR Code:', data.base64)
    // Copie o base64 e cole em: https://base64.guru/converter/decode/image
  }
})
```

#### Solução 2: Recriar Tudo do Zero

Se nada funcionar, limpe tudo e recomece:

1. **Deletar no Evolution API:**
```javascript
fetch('https://service-evolution-api.tnvro1.easypanel.host/instance/delete/instance_abc12345', {
  method: 'DELETE',
  headers: { 'apikey': 'SUA_GLOBAL_API_KEY' }
})
```

2. **Limpar no Supabase:**
```sql
DELETE FROM whatsapp_connections WHERE user_id = 'SEU_USER_ID';
```

3. **Limpar localStorage:**
```javascript
localStorage.clear()
```

4. **Recarregar página e tentar novamente**

---

### Passo 5: Verificar Estrutura da Resposta

Cole isso no console após o erro:

```javascript
// Chamar API manualmente e ver resposta completa
async function testarConnect() {
  const instanceName = 'instance_abc12345' // SEU INSTANCE NAME
  const apiKey = 'SUA_GLOBAL_API_KEY'
  const apiUrl = 'https://service-evolution-api.tnvro1.easypanel.host'

  console.log('Testando conexão...')

  const response = await fetch(`${apiUrl}/instance/connect/${instanceName}`, {
    headers: { 'apikey': apiKey }
  })

  console.log('Status:', response.status)
  console.log('Headers:', [...response.headers.entries()])

  const data = await response.json()
  console.log('Resposta completa:', data)
  console.log('Estrutura:', Object.keys(data))

  // Tentar encontrar QR Code em diferentes lugares
  console.log('\nProcurando QR Code:')
  console.log('data.base64:', data.base64 ? 'ENCONTRADO' : 'não encontrado')
  console.log('data.qrcode:', data.qrcode ? 'ENCONTRADO' : 'não encontrado')
  console.log('data.code:', data.code ? 'ENCONTRADO' : 'não encontrado')
  console.log('data.qr:', data.qr ? 'ENCONTRADO' : 'não encontrado')

  // Se encontrou em algum lugar, mostrar
  const qrCode = data.base64 || data.qrcode?.base64 || data.code || data.qr
  if (qrCode) {
    console.log('\n✅ QR Code encontrado!')
    console.log('Tamanho:', qrCode.length, 'caracteres')
    console.log('Começa com:', qrCode.substring(0, 50))
  } else {
    console.log('\n❌ QR Code NÃO encontrado')
    console.log('Resposta completa:', JSON.stringify(data, null, 2))
  }

  return data
}

testarConnect()
```

**Me mande a saída desse teste para eu poder ajudar melhor!**

---

## Checklist de Debug

Quando reportar o problema, inclua:

- [ ] Status da resposta ao criar instância (201? 403? outro?)
- [ ] Status da resposta ao conectar (200? 403? 404?)
- [ ] Estrutura da resposta do connect (Object.keys())
- [ ] Se data.base64 existe
- [ ] Logs completos do console
- [ ] Valor de `instanceExists` no localStorage
- [ ] Registro na tabela `whatsapp_connections`

---

## Casos Conhecidos

### Caso 1: Evolution API v1 vs v2
Algumas versões da Evolution API retornam QR Code em formatos diferentes:

- **v1:** `data.base64`
- **v2:** `data.qrcode.base64`
- **v3:** `data.code`

O código agora suporta todos esses formatos! Se ainda não funcionar, a API pode estar usando outro formato.

### Caso 2: Instância Já Conectada
Se a instância já está conectada, a API não retorna QR Code (não precisa!).

**Solução:** Recarregue a página e veja se já mostra "Conectado"

### Caso 3: API Key com Permissões Limitadas
Mesmo usando "Global API Key", ela pode ter permissões limitadas na configuração do Evolution.

**Solução:** Verifique permissões no painel da Evolution API

---

## Se Nada Funcionar

Entre em contato e me envie:

1. Print do console completo (F12 → Console)
2. Resultado do teste `testarConnect()` acima
3. SQL: `SELECT * FROM whatsapp_connections`
4. localStorage: `whatsapp_status` e `whatsapp_instance_exists`
5. Versão da Evolution API que você está usando

Vou conseguir diagnosticar e corrigir! 🔧
