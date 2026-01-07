# JQL Documentation Reference Format

*(Senior / infra / edge-oriented)*

Bu format **tüm dokümanlar** için geçerlidir (README, quick-start, internals, performance, vb.).
Her doküman bu blokların **tamamını kullanmak zorunda değil**.

---

## 1. Başlık

**Amaç:** Okuyucuya “neredeyim?” demek.
**Amaç dışı:** İçeriği bölmek.

Kurallar:

* Kısa ve açıklayıcı
* “How / Why / Internals / Performance” gibi net kelimeler
* Başlık altında **liste başlamaz**

Örnek:

```md
## Streaming Execution Model
```

---

## 2. Felsefe / Niyet (zorunlu)

**Bu bölüm dokümanın omurgasıdır.**

Cevapladığı sorular:

* Bu şey neden var?
* Hangi problem alanını hedefliyor?
* Hangi beklentiyle okunmalı?

Kurallar:

* 1–2 paragraf
* Genel, bağlamsal
* Kod yok
* Liste yok

Örnek ton:

> JQL is designed for environments where data volume is high and execution predictability matters more than expressive power. The primary goal is to make JSON selection cheap, stable, and explainable under sustained load.

---

## 3. Kısa Açıklama (opsiyonel, ama güçlü)

**Amaç:** Reviewer / ops okuyup geçebilsin.

Kurallar:

* Tek paragraf
* “TL;DR” gibi işlev görür
* Detaya girmez
* Bu bölüm yoksa da olur

Örnek:

> In practice, this means JQL reads input once, skips unrequested regions early, and emits results incrementally without retaining global state.

---

## 4. Derin Teknik Anlatım (ana gövde)

**Burada obsesif detaya girebilirsin.**
Ama **tek bir düşünce hattı** olacak.

Kurallar:

* Uzun paragraflar kabul edilebilir
* Aynı fikri bölüp alt başlık yapma
* “Hot path / cold path” gibi yapay ayrımlar yok
* Liste sadece gerçekten kaçınılmazsa

Yazım ilkesi:

* “nasıl çalışıyor” + “neden böyle”
* Mutlak iddia yok (“always”, “never”, “guarantee” yok)
* Koddan türeyen ama kodu tekrar etmeyen anlatım

Örnek ton:

> During traversal, the engine deliberately avoids materializing intermediate structures unless a match is confirmed. This is not an optimization layered on top of parsing, but a consequence of treating JSON as a structured byte stream rather than an object graph.

---

## 5. Kod / Akış / Mekanizma (duruma göre)

Öncelik sırası:

1. **Gerçek kod** (repo ile birebir)
2. **Akış anlatımı** (metinsel)
3. **Mekanizma açıklaması** (soyut)

Kurallar:

* Kod varsa: kısa, bağlamlı, spekülasyonsuz
* Kod yoksa: “pseudo-code” yok
* Diagram şart değil; metin yeterli

---

## 6. Sınırlar ve Bilinçli Non-Goals (çok önemli)

Bu bölüm **güven inşa eder**.

Cevapladığı sorular:

* Neler yapılmıyor?
* Neden yapılmıyor?
* Bu bir eksik mi, tercih mi?

Kurallar:

* Savunmacı dil yok
* “Out of scope by design” tonu
* Liste olabilir ama kısa

Örnek:

> Features that require revisiting previously seen data are intentionally excluded, as they conflict with the forward-only execution model.

---

## 7. Referans / İlham / Bağlam (opsiyonel ama önerilir)

**Amaç:** Entelektüel dürüstlük.

Kurallar:

* Blog pornosu yok
* Stabil, uzun ömürlü kaynak
* “Bunu biz uydurmadık” hissi

Örnek:

```md
References:
- Node.js and the V8 engine execution model
- Streaming data processing patterns in edge systems
```

---

# Dil Kuralları (çok kritik)

Bunlar format kadar önemli:

* ❌ Pazarlama sıfatları yok (“blazing”, “fastest”, “battle-proven”)
* ❌ Explain-like-I’m-5 yok
* ❌ Liste enflasyonu yok
* ✅ Akademik, sakin, senior-to-senior
* ✅ “Neden” anlatımı “sonuç”tan önce gelir
* ✅ Okuyucu aptal varsayılmaz

---

## Bu formatı nasıl kullanmalısın?

* IDE’de yanına bu şablonu aç
* Yazdığın her paragraf için sor:

  > “Bu paragraf hangi bloğa ait?”
* Eğer bir paragraf iki bloğa birden aitse → böl ama **başlıkla değil**, paragrafla
