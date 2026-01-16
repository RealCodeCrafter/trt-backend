# Postman'da Create qilish - To'liq qo'llanma

## Parts (Products) Create - POST /products

### Method: POST
### URL: `{{baseUrl}}/products`
### Headers:
```
Authorization: Bearer {{token}}
```

### Body: form-data

#### Majburiy maydonlar:
| Key | Type | Value | Izoh |
|-----|------|-------|------|
| `data` | text | `{"sku":"SKU-001","translations":{"en":{"name":"Brake Pad"},"ru":{"name":"Колодка тормозная"}},"trtCode":"TRT-001","brand":"Toyota"}` | Barcha ma'lumotlar JSON string sifatida |

#### Ixtiyoriy maydonlar (data JSON ichida):
| Key | Type | Value | Izoh |
|-----|------|-------|------|
| `carName` | array | `["Camry", "Corolla"]` | Array |
| `model` | array | `["2020", "2021"]` | Array |
| `oem` | array | `["OEM123", "OEM456"]` | Array |
| `years` | array | `["2020", "2021", "2022"]` | Array |
| `categories` | array | `[1, 2, 3]` | Category ID lar (number array) |
| `imageUrl` | string | `https://example.com/image.jpg` | Agar rasm yuklamasangiz |

#### Rasmlar (Multiple files):
| Key | Type | Value | Izoh |
|-----|------|-------|------|
| `images` | file | [bir nechta fayl tanlash] | Bir nechta rasm yuklash mumkin (20 tagacha). Postman'da bir nechta fayl tanlash uchun `images` field'ni duplicate qiling. |

### To'liq misol:

**Form-data fieldlar:**

1. `data` = `{"sku":"SKU-001","translations":{"en":{"name":"Brake Pad"},"ru":{"name":"Колодка тормозная"}},"trtCode":"TRT-001","brand":"Toyota","carName":["Camry","Corolla"],"model":["2020","2021"],"oem":["OEM123","OEM456"],"years":["2020","2021","2022"],"categories":[1,2]}`
2. `images` = [fayl 1, fayl 2, fayl 3] (bir nechta fayl tanlash yoki field'ni duplicate qiling)

---

## Categories Create - POST /categories

### Method: POST
### URL: `{{baseUrl}}/categories`
### Headers:
```
Authorization: Bearer {{token}}
```

### Body: form-data

#### Majburiy maydonlar:
| Key | Type | Value | Izoh |
|-----|------|-------|------|
| `data` | text | `{"translations":{"en":{"name":"Brake Parts","description":"All brake related parts"},"ru":{"name":"Тормозные детали","description":"Все детали, связанные с тормозами"}}}` | Barcha ma'lumotlar JSON string sifatida |

#### Ixtiyoriy maydonlar (data JSON ichida):
| Key | Type | Value | Izoh |
|-----|------|-------|------|
| `parts` | array | `[1, 2, 3]` | Part ID lar (number array) |
| `imageUrl` | string | `https://example.com/image.jpg` | Agar rasm yuklamasangiz |

#### Rasmlar (Multiple files):
| Key | Type | Value | Izoh |
|-----|------|-------|------|
| `images` | file | [bir nechta fayl tanlash] | Bir nechta rasm yuklash mumkin (20 tagacha). Postman'da bir nechta fayl tanlash uchun `images` field'ni duplicate qiling. |

### To'liq misol:

**Form-data fieldlar:**

1. `data` = `{"translations":{"en":{"name":"Brake Parts","description":"All brake related parts"},"ru":{"name":"Тормозные детали","description":"Все детали, связанные с тормозами"}},"parts":[1,2,3]}`
2. `images` = [fayl 1, fayl 2] (bir nechta fayl tanlash yoki field'ni duplicate qiling)

---

## Muhim eslatmalar:

1. **Data field**: Barcha ma'lumotlar `data` field'ida JSON string sifatida
   - To'g'ri: `{"sku":"SKU-001","translations":{...}}`
   - Noto'g'ri: Alohida fieldlar

2. **Array fieldlar**: JSON ichida array sifatida
   - To'g'ri: `"carName":["Camry","Corolla"]`
   - Noto'g'ri: `"carName":"[\"Camry\",\"Corolla\"]"`

3. **Multiple images**: Bir nechta `images` field qo'shing
   - Har biriga bitta fayl tanlang
   - 20 tagacha rasm yuklash mumkin

4. **Translations**: JSON ichida object sifatida
   - To'g'ri: `"translations":{"en":{"name":"Name"},"ru":{"name":"Имя"}}`

5. **Categories/Parts IDs**: Number array
   - To'g'ri: `"categories":[1,2,3]`
   - Noto'g'ri: `"categories":["1","2","3"]`

6. **Token**: Avval Login qiling, token avtomatik saqlanadi

## Misol JSON (data field uchun):

### Parts Create:
```json
{
  "sku": "SKU-001",
  "translations": {
    "en": {"name": "Brake Pad"},
    "ru": {"name": "Колодка тормозная"}
  },
  "trtCode": "TRT-001",
  "brand": "Toyota",
  "carName": ["Camry", "Corolla"],
  "model": ["2020", "2021"],
  "oem": ["OEM123", "OEM456"],
  "years": ["2020", "2021", "2022"],
  "categories": [1, 2]
}
```

### Categories Create:
```json
{
  "translations": {
    "en": {
      "name": "Brake Parts",
      "description": "All brake related parts"
    },
    "ru": {
      "name": "Тормозные детали",
      "description": "Все детали, связанные с тормозами"
    }
  },
  "parts": [1, 2, 3]
}
```
