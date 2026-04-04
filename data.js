const STABLECOIN_DATA = {
  "meta": {
    "lastUpdated": "2026-04-04",
    "totalMarketCap": 299392194016
  },
  "issuers": [
    {
      "id": "tether",
      "name": "Tether Holdings",
      "logo": "\u20ae",
      "logoColor": "#26A17B",
      "founded": 2014,
      "headquarters": "El Salvador",
      "website": "https://tether.to",
      "description": "The world's largest stablecoin issuer, providing liquidity and stability across global crypto markets. Tether's USDT is the most traded asset in cryptocurrency.",
      "regulatoryStatus": "Licensed",
      "stablecoins": [
        {
          "ticker": "USDT",
          "name": "Tether USD",
          "peg": "USD",
          "marketCap": 184140720659,
          "type": "Fiat-backed",
          "launched": "2015-02-25",
          "status": "active",
          "reserves": "Cash & cash equivalents, US Treasuries, Gold",
          "reserveManager": "Cantor Fitzgerald",
          "custodian": "BNY Mellon",
          "blockchains": [
            "Ethereum",
            "Tron",
            "Solana",
            "BNB Chain",
            "Avalanche",
            "Polygon",
            "Optimism",
            "Arbitrum",
            "TON",
            "Algorand"
          ]
        },
        {
          "ticker": "XAUT",
          "name": "Tether Gold",
          "peg": "Gold (troy oz)",
          "marketCap": 2594505697,
          "type": "Commodity-backed",
          "launched": "2020-01-23",
          "status": "active",
          "reserves": "Physical gold held in Swiss vaults",
          "reserveManager": "Tether Holdings",
          "custodian": "Tether Holdings (self-custodied, Swiss vaults)",
          "blockchains": [
            "Ethereum",
            "Tron"
          ]
        },
        {
          "ticker": "USDT0",
          "name": "Tether USD0",
          "peg": "USD",
          "marketCap": null,
          "type": "Fiat-backed",
          "launched": "2025-02-01",
          "status": "active",
          "reserves": "USDT bridged via LayerZero OFT standard",
          "reserveManager": "Tether Holdings",
          "custodian": "\u2014",
          "blockchains": [
            "Arbitrum",
            "Optimism",
            "Unichain"
          ],
          "isNew": true
        }
      ],
      "news": [
        {
          "date": "2026-02-18",
          "headline": "Tether launches USDT0 with LayerZero OFT standard for unified cross-chain liquidity",
          "summary": "Tether introduced USDT0, a new omnichain version of USDT built on LayerZero's OFT standard, enabling seamless cross-chain transfers without fragmented liquidity.",
          "tags": [
            "product",
            "cross-chain"
          ],
          "url": "https://tether.to/en/news/"
        },
        {
          "date": "2026-01-30",
          "headline": "Tether reports $13B net profit in 2025, USDT market cap surpasses $140B",
          "summary": "Tether announced record profits driven primarily by US Treasury yields, with reserves now exceeding liabilities by over $8 billion.",
          "tags": [
            "financials",
            "reserves"
          ],
          "url": "https://tether.to/en/news/"
        },
        {
          "date": "2025-12-10",
          "headline": "Tether expands to TON blockchain, targeting Telegram's 900M user base",
          "summary": "USDT on TON surpassed $1B in circulation within weeks of launch, driven by Telegram's built-in crypto wallet.",
          "tags": [
            "expansion",
            "blockchain"
          ],
          "url": "https://tether.to/en/news/"
        }
      ]
    },
    {
      "id": "circle",
      "name": "Circle",
      "logo": "\u25ce",
      "logoColor": "#2775CA",
      "founded": 2013,
      "headquarters": "Boston, MA, USA",
      "website": "https://circle.com",
      "description": "Circle is a global financial technology company and the issuer of USDC, a fully reserved dollar stablecoin. Circle filed for IPO in 2025 and operates under US regulatory oversight.",
      "regulatoryStatus": "Licensed (US MSB, EU EMI)",
      "stablecoins": [
        {
          "ticker": "USDC",
          "name": "USD Coin",
          "peg": "USD",
          "marketCap": 77544243137,
          "type": "Fiat-backed",
          "launched": "2018-09-26",
          "status": "active",
          "reserves": "Cash and short-duration US Treasuries",
          "reserveManager": "BlackRock (Circle Reserve Fund)",
          "custodian": "BNY Mellon",
          "blockchains": [
            "Ethereum",
            "Solana",
            "Avalanche",
            "Arbitrum",
            "Base",
            "Optimism",
            "Polygon",
            "Noble",
            "Stellar",
            "Algorand",
            "Hedera",
            "NEAR"
          ]
        },
        {
          "ticker": "EURC",
          "name": "Euro Coin",
          "peg": "EUR",
          "marketCap": 413116215,
          "type": "Fiat-backed",
          "launched": "2022-06-30",
          "status": "active",
          "reserves": "Euro-denominated cash and equivalents",
          "reserveManager": "Circle",
          "custodian": "European regulated banks",
          "blockchains": [
            "Ethereum",
            "Avalanche",
            "Solana",
            "Stellar",
            "Base"
          ]
        }
      ],
      "news": [
        {
          "date": "2026-02-25",
          "headline": "Circle's IPO priced at $31 per share, valuing the company at $18B",
          "summary": "Circle went public on the NYSE, becoming the first major stablecoin issuer to list publicly. The offering raised $624M for the company.",
          "tags": [
            "IPO",
            "corporate"
          ],
          "url": "https://www.circle.com/blog/"
        },
        {
          "date": "2026-01-15",
          "headline": "Circle launches USDC on Noble, enabling native IBC transfers across Cosmos ecosystem",
          "summary": "USDC is now natively issued on Noble, a Cosmos appchain purpose-built for asset issuance, enabling fee-free transfers across 50+ IBC-connected chains.",
          "tags": [
            "expansion",
            "Cosmos"
          ],
          "url": "https://www.circle.com/blog/"
        },
        {
          "date": "2025-11-20",
          "headline": "EURC volume surges 300% following EU MiCA stablecoin framework activation",
          "summary": "Circle's EURC became the go-to MiCA-compliant euro stablecoin, with several European banks integrating EURC for settlement.",
          "tags": [
            "regulation",
            "Europe"
          ],
          "url": "https://www.circle.com/blog/"
        }
      ]
    },
    {
      "id": "sky",
      "name": "Sky (formerly MakerDAO)",
      "logo": "\u25c8",
      "logoColor": "#1AAB9B",
      "founded": 2014,
      "headquarters": "Decentralized (DAO)",
      "website": "https://sky.money",
      "description": "Sky, formerly MakerDAO, is the decentralized protocol behind the DAI and USDS stablecoins. Governed by SKY token holders, it is one of DeFi's most battle-tested protocols with over a decade of operation.",
      "regulatoryStatus": "Decentralized DAO",
      "stablecoins": [
        {
          "ticker": "USDS",
          "name": "Sky Dollar",
          "peg": "USD",
          "marketCap": 11808712692,
          "type": "Crypto-collateralized",
          "launched": "2024-08-20",
          "status": "active",
          "reserves": "Over-collateralized crypto assets + RWA",
          "reserveManager": "Sky Protocol (on-chain DAO)",
          "custodian": "Smart contracts (on-chain)",
          "blockchains": [
            "Ethereum",
            "Base",
            "Arbitrum",
            "Optimism"
          ],
          "isNew": true
        },
        {
          "ticker": "DAI",
          "name": "Dai",
          "peg": "USD",
          "marketCap": 4453914562,
          "type": "Crypto-collateralized",
          "launched": "2017-12-18",
          "status": "active",
          "reserves": "Over-collateralized crypto assets + RWA",
          "reserveManager": "Sky Protocol (on-chain DAO)",
          "custodian": "Smart contracts (on-chain)",
          "blockchains": [
            "Ethereum",
            "Polygon",
            "Optimism",
            "Arbitrum",
            "Avalanche",
            "BNB Chain"
          ]
        }
      ],
      "news": [
        {
          "date": "2026-02-10",
          "headline": "Sky Protocol surpasses $12B in total value locked across USDS and DAI",
          "summary": "The Sky protocol hit a new TVL milestone with growing adoption of USDS across major DeFi protocols, aided by the Sky Savings Rate offering yield to USDS holders.",
          "tags": [
            "TVL",
            "DeFi"
          ],
          "url": "https://sky.money/"
        },
        {
          "date": "2025-12-05",
          "headline": "Sky Protocol integrates BlackRock's BUIDL as collateral for USDS",
          "summary": "Sky's endgame plan includes diversifying into tokenized real-world assets; BlackRock's BUIDL fund was approved as collateral, earning yield for the protocol.",
          "tags": [
            "RWA",
            "partnership"
          ],
          "url": "https://sky.money/"
        },
        {
          "date": "2025-10-15",
          "headline": "MakerDAO rebrand to Sky completes, DAI migration to USDS reaches 40%",
          "summary": "The rebranding from MakerDAO to Sky is complete. Users can upgrade DAI to USDS 1:1 and earn Sky Savings Rate yield.",
          "tags": [
            "rebrand",
            "product"
          ],
          "url": "https://sky.money/"
        }
      ]
    },
    {
      "id": "ethena",
      "name": "Ethena Labs",
      "logo": "\u27c1",
      "logoColor": "#9B59B6",
      "founded": 2023,
      "headquarters": "British Virgin Islands",
      "website": "https://ethena.fi",
      "description": "Ethena is a synthetic dollar protocol built on Ethereum. USDe is collateralized by delta-neutral positions combining staked ETH and short perpetual futures, generating yield through funding rates.",
      "regulatoryStatus": "Unregulated",
      "stablecoins": [
        {
          "ticker": "USDe",
          "name": "Ethena USD",
          "peg": "USD",
          "marketCap": 5886631977,
          "type": "Synthetic / Delta-neutral",
          "launched": "2024-02-19",
          "status": "active",
          "reserves": "stETH + short ETH/BTC perp positions",
          "reserveManager": "Ethena Labs (delta-neutral)",
          "custodian": "Copper / Fireblocks",
          "blockchains": [
            "Ethereum",
            "Arbitrum",
            "Optimism",
            "Base",
            "BNB Chain"
          ]
        },
        {
          "ticker": "USDtb",
          "name": "Ethena USD Treasury-backed",
          "peg": "USD",
          "marketCap": 1400000000,
          "type": "Fiat-backed (RWA)",
          "launched": "2024-12-12",
          "status": "active",
          "reserves": "BlackRock BUIDL tokenized US Treasuries",
          "reserveManager": "BlackRock (BUIDL fund)",
          "custodian": "Anchorage Digital Bank",
          "blockchains": [
            "Ethereum"
          ],
          "issuer": "Anchorage Digital Bank",
          "isNew": true
        },
        {
          "ticker": "iUSDe",
          "name": "Ethena Institutional USD",
          "peg": "USD",
          "marketCap": null,
          "type": "Yield-bearing",
          "launched": "2025-04-01",
          "status": "active",
          "reserves": "USDe with built-in sUSDe yield accrual",
          "reserveManager": "Ethena Labs",
          "custodian": "\u2014",
          "blockchains": [
            "Ethereum"
          ],
          "isNew": true
        }
      ],
      "news": [
        {
          "date": "2026-03-01",
          "headline": "Ethena USDe surpasses $7B market cap, becomes 4th largest stablecoin",
          "summary": "Ethena's USDe has grown to become the 4th largest stablecoin by market cap, with demand driven by its sUSDe yield product offering 15-25% APY.",
          "tags": [
            "growth",
            "yield"
          ],
          "url": "https://ethena.fi/"
        },
        {
          "date": "2026-01-20",
          "headline": "Ethena launches iUSDe for institutional investors with KYC/AML compliance",
          "summary": "iUSDe targets institutional capital by wrapping sUSDe yield into a KYC-compliant instrument, integrating with traditional prime brokers.",
          "tags": [
            "institutional",
            "product"
          ],
          "url": "https://ethena.fi/"
        },
        {
          "date": "2025-11-08",
          "headline": "USDtb launches backed by BlackRock BUIDL, providing USDe collateral diversification",
          "summary": "USDtb serves as a risk-off collateral option for the Ethena protocol when perpetual funding rates turn negative, improving protocol resilience.",
          "tags": [
            "product",
            "RWA"
          ],
          "url": "https://ethena.fi/"
        }
      ]
    },
    {
      "id": "paxos",
      "name": "Paxos Trust Company",
      "logo": "\u2c63",
      "logoColor": "#00C48C",
      "founded": 2012,
      "headquarters": "New York, NY, USA",
      "website": "https://paxos.com",
      "description": "Paxos is a regulated blockchain infrastructure platform and trust company. It issues regulated stablecoins and tokenized assets, serving as the infrastructure partner for PayPal's PYUSD.",
      "regulatoryStatus": "Licensed (NYDFS Trust Charter, MAS License)",
      "stablecoins": [
        {
          "ticker": "PYUSD",
          "name": "PayPal USD",
          "peg": "USD",
          "marketCap": 3943644421,
          "type": "Fiat-backed",
          "launched": "2023-08-07",
          "status": "active",
          "reserves": "US Treasury bills, cash equivalents",
          "reserveManager": "BlackRock",
          "custodian": "Paxos Trust",
          "blockchains": [
            "Ethereum",
            "Solana"
          ]
        },
        {
          "ticker": "USDP",
          "name": "Pax Dollar",
          "peg": "USD",
          "marketCap": 40567216,
          "type": "Fiat-backed",
          "launched": "2018-09-10",
          "status": "active",
          "reserves": "Cash and US Treasuries held at FDIC-insured banks",
          "reserveManager": "Paxos Trust",
          "custodian": "FDIC-insured banks",
          "blockchains": [
            "Ethereum"
          ]
        },
        {
          "ticker": "PAXG",
          "name": "PAX Gold",
          "peg": "Gold (troy oz)",
          "marketCap": 2391579586,
          "type": "Commodity-backed",
          "launched": "2019-09-10",
          "status": "active",
          "reserves": "Physical gold bars in Brink's vaults, London",
          "reserveManager": "Paxos Trust",
          "custodian": "Brink's (London)",
          "blockchains": [
            "Ethereum"
          ]
        },
        {
          "ticker": "USDL",
          "name": "Lift Dollar",
          "peg": "USD",
          "marketCap": null,
          "type": "Yield-bearing Fiat-backed",
          "launched": "2024-06-01",
          "status": "active",
          "reserves": "Cash and US Treasuries, yield passed to holders",
          "reserveManager": "Paxos Trust",
          "custodian": "\u2014",
          "blockchains": [
            "Ethereum"
          ],
          "isNew": true
        }
      ],
      "news": [
        {
          "date": "2026-02-05",
          "headline": "Paxos obtains MAS Major Payment Institution license, expands PYUSD to Singapore",
          "summary": "Paxos secured its Singapore MAS license, enabling PYUSD distribution across Southeast Asia and positioning it as a key regulated dollar stablecoin in Asia-Pacific.",
          "tags": [
            "regulation",
            "expansion"
          ],
          "url": "https://paxos.com/blog/"
        },
        {
          "date": "2026-01-08",
          "headline": "PYUSD volume on Solana surpasses Ethereum, driven by PayPal app integrations",
          "summary": "Solana's fast finality and low fees made it the dominant chain for PYUSD transactions, with PayPal reporting over 3M PYUSD transactions per month.",
          "tags": [
            "Solana",
            "adoption"
          ],
          "url": "https://paxos.com/blog/"
        },
        {
          "date": "2025-10-22",
          "headline": "Paxos launches USDL, first yield-bearing stablecoin to pass returns to holders in real time",
          "summary": "Unlike traditional stablecoins that keep yield internally, USDL distributes US Treasury yield directly to token holders every second via rebasing.",
          "tags": [
            "product",
            "yield"
          ],
          "url": "https://paxos.com/blog/"
        }
      ]
    },
    {
      "id": "ripple",
      "name": "Ripple Labs",
      "logo": "\u25c8",
      "logoColor": "#346AA9",
      "founded": 2012,
      "headquarters": "San Francisco, CA, USA",
      "website": "https://ripple.com",
      "description": "Ripple Labs is the company behind the XRP Ledger and XRP. Following years of SEC litigation, Ripple launched RLUSD in late 2024 as a fully regulated dollar stablecoin, targeting enterprise cross-border payments.",
      "regulatoryStatus": "Licensed (NYDFS Trust Charter)",
      "stablecoins": [
        {
          "ticker": "RLUSD",
          "name": "Ripple USD",
          "peg": "USD",
          "marketCap": 1370957003,
          "type": "Fiat-backed",
          "launched": "2024-12-17",
          "status": "active",
          "reserves": "US Treasury bills, cash equivalents, money market funds",
          "reserveManager": "Multiple money market funds",
          "custodian": "\u2014",
          "blockchains": [
            "XRP Ledger",
            "Ethereum"
          ],
          "isNew": true
        }
      ],
      "news": [
        {
          "date": "2026-02-28",
          "headline": "RLUSD reaches $400M market cap, with 70% on XRP Ledger",
          "summary": "RLUSD is gaining traction in cross-border payment corridors, with several money transfer operators integrating it for USD settlement on the XRP Ledger's DEX.",
          "tags": [
            "growth",
            "payments"
          ],
          "url": "https://ripple.com/insights/"
        },
        {
          "date": "2026-01-25",
          "headline": "Ripple integrates RLUSD into its Payments network, used by 20+ financial institutions",
          "summary": "Ripple's enterprise payment network now settles using RLUSD as the bridging currency, replacing XRP in corridors where regulatory clarity is needed.",
          "tags": [
            "enterprise",
            "adoption"
          ],
          "url": "https://ripple.com/insights/"
        },
        {
          "date": "2025-12-17",
          "headline": "RLUSD officially launches after NYDFS approval, first purchases on XRPL DEX",
          "summary": "Ripple launched RLUSD after receiving approval from the New York Department of Financial Services, becoming one of the few stablecoins with direct NYDFS oversight.",
          "tags": [
            "launch",
            "regulation"
          ],
          "url": "https://ripple.com/insights/"
        }
      ]
    },
    {
      "id": "first-digital",
      "name": "First Digital Trust",
      "logo": "\u0191",
      "logoColor": "#F0A500",
      "founded": 2017,
      "headquarters": "Hong Kong",
      "website": "https://firstdigitallabs.com",
      "description": "First Digital Trust is a Hong Kong-based qualified trustee and digital asset custodian. FDUSD was launched in 2023 and quickly gained traction on Binance as the primary trading stablecoin following BUSD's discontinuation.",
      "regulatoryStatus": "Licensed (Hong Kong Trust Company)",
      "stablecoins": [
        {
          "ticker": "FDUSD",
          "name": "First Digital USD",
          "peg": "USD",
          "marketCap": 393904037,
          "type": "Fiat-backed",
          "launched": "2023-06-01",
          "status": "active",
          "reserves": "Cash and short-term US Treasuries held in trust",
          "reserveManager": "First Digital Trust",
          "custodian": "First Digital Trust (Hong Kong)",
          "blockchains": [
            "Ethereum",
            "BNB Chain",
            "Sui",
            "Solana"
          ]
        }
      ],
      "news": [
        {
          "date": "2026-01-30",
          "headline": "FDUSD expands to Sui blockchain, targeting Asian DeFi users",
          "summary": "First Digital partnered with the Sui Foundation to bring FDUSD to the Sui ecosystem, capitalizing on Sui's growing user base in Asia.",
          "tags": [
            "expansion",
            "Sui"
          ],
          "url": "https://firstdigitallabs.com/"
        },
        {
          "date": "2025-09-15",
          "headline": "Binance continues FDUSD zero-fee trading pairs, cementing market position",
          "summary": "Binance's decision to maintain zero-fee spot trading for FDUSD pairs helped the stablecoin maintain its $2B+ market cap despite broader market competition.",
          "tags": [
            "Binance",
            "trading"
          ],
          "url": "https://firstdigitallabs.com/"
        },
        {
          "date": "2025-07-20",
          "headline": "First Digital publishes monthly attestation reports, improves transparency",
          "summary": "Following scrutiny over reserve transparency, First Digital began publishing monthly third-party attestation reports from a Big Four auditing firm.",
          "tags": [
            "transparency",
            "reserves"
          ],
          "url": "https://firstdigitallabs.com/"
        }
      ]
    },
    {
      "id": "frax",
      "name": "Frax Finance",
      "logo": "\u0192",
      "logoColor": "#E74C3C",
      "founded": 2020,
      "headquarters": "Decentralized (DAO)",
      "website": "https://frax.finance",
      "description": "Frax Finance is a DeFi protocol pioneering algorithmic and hybrid stablecoin designs. Frax v3 has moved toward a fully collateralized model using real-world assets and on-chain assets.",
      "regulatoryStatus": "Decentralized DAO",
      "stablecoins": [
        {
          "ticker": "frxUSD",
          "name": "Frax USD",
          "peg": "USD",
          "marketCap": 119863579,
          "type": "Fiat-backed (via RWA)",
          "launched": "2024-10-01",
          "status": "active",
          "reserves": "BlackRock BUIDL, FinresPBC US Treasuries",
          "reserveManager": "BlackRock (BUIDL) + FinresPBC",
          "custodian": "FinresPBC",
          "blockchains": [
            "Ethereum",
            "Arbitrum",
            "Fraxtal"
          ],
          "isNew": true
        },
        {
          "ticker": "FRAX",
          "name": "Frax",
          "peg": "USD",
          "marketCap": 274095504,
          "type": "Algorithmic / Hybrid",
          "launched": "2020-12-22",
          "status": "legacy",
          "reserves": "USDC collateral + FXS algorithmic component",
          "reserveManager": "Frax Finance / Circle",
          "custodian": "\u2014",
          "blockchains": [
            "Ethereum",
            "Arbitrum",
            "Optimism",
            "Polygon",
            "Avalanche",
            "BNB Chain",
            "Fraxtal"
          ]
        },
        {
          "ticker": "FPI",
          "name": "Frax Price Index",
          "peg": "CPI (inflation index)",
          "marketCap": 0,
          "type": "Algorithmic",
          "launched": "2022-04-06",
          "status": "active",
          "reserves": "FRAX collateral with CPI oracle",
          "reserveManager": "Frax Finance",
          "custodian": "On-chain (smart contracts)",
          "blockchains": [
            "Ethereum"
          ]
        }
      ],
      "news": [
        {
          "date": "2026-02-14",
          "headline": "frxUSD surpasses FRAX in market cap as Frax v3 RWA strategy gains traction",
          "summary": "Frax Finance's pivot to fully-backed frxUSD with US Treasury RWA collateral has attracted institutional demand, with frxUSD growing to $850M.",
          "tags": [
            "product",
            "RWA"
          ],
          "url": "https://frax.finance/"
        },
        {
          "date": "2025-12-01",
          "headline": "Fraxtal L2 launches with frxUSD as native gas token, boosting ecosystem",
          "summary": "Frax's own Layer 2 blockchain Fraxtal uses frxETH for gas, but frxUSD plays a central role in its DeFi ecosystem with deep liquidity pools.",
          "tags": [
            "L2",
            "Fraxtal"
          ],
          "url": "https://frax.finance/"
        },
        {
          "date": "2025-09-30",
          "headline": "Frax Finance proposes FinresPBC to manage US Treasury reserves for FRAX",
          "summary": "Frax created FinresPBC, a Wyoming special purpose depository institution, to hold fiat reserves backing frxUSD, moving toward regulatory compliance.",
          "tags": [
            "regulation",
            "reserves"
          ],
          "url": "https://frax.finance/"
        }
      ]
    },
    {
      "id": "ondo",
      "name": "Ondo Finance",
      "logo": "\u03a9",
      "logoColor": "#E67E22",
      "founded": 2021,
      "headquarters": "New York, NY, USA",
      "website": "https://ondo.finance",
      "description": "Ondo Finance is a tokenized real-world asset protocol focused on bringing institutional-grade financial products on-chain. USDY is their yield-bearing stablecoin backed by US Treasuries.",
      "regulatoryStatus": "Regulated (SEC-compliant for non-US holders)",
      "stablecoins": [
        {
          "ticker": "USDY",
          "name": "US Dollar Yield",
          "peg": "USD",
          "marketCap": 1315737731,
          "type": "Yield-bearing / RWA-backed",
          "launched": "2023-08-01",
          "status": "active",
          "reserves": "Short-term US Treasuries and bank demand deposits",
          "reserveManager": "Ondo Finance",
          "custodian": "U.S. Bank N.A.",
          "blockchains": [
            "Ethereum",
            "Solana",
            "Aptos",
            "Mantle",
            "Sui"
          ]
        },
        {
          "ticker": "OUSG",
          "name": "Ondo Short-Term US Gov. Bond Fund",
          "peg": "USD (yield-bearing)",
          "marketCap": 650000000,
          "type": "Tokenized Fund / RWA",
          "launched": "2023-01-12",
          "status": "active",
          "reserves": "BlackRock's SHV ETF (short-term Treasuries)",
          "reserveManager": "BlackRock (SHV ETF)",
          "custodian": "Ondo Finance",
          "blockchains": [
            "Ethereum",
            "Solana",
            "Polygon"
          ]
        },
        {
          "ticker": "OUSG2223",
          "name": "Ondo Short-Term US Gov. Bond Fund",
          "peg": "USD (yield-bearing)",
          "marketCap": 650000000,
          "type": "Tokenized Fund / RWA",
          "launched": "2023-01-12",
          "status": "active",
          "reserves": "BlackRock's SHV ETF (short-term Treasuries)",
          "reserveManager": "BlackRock (SHV ETF)",
          "custodian": "Ondo Finance",
          "blockchains": [
            "Ethereum",
            "Solana",
            "Polygon"
          ]
        }
      ],
      "news": [
        {
          "date": "2026-02-20",
          "headline": "Ondo Finance launches on Aptos and Mantle, targets Asia-Pacific RWA demand",
          "summary": "Ondo expanded USDY to Aptos and Mantle networks, with Mantle's treasury being one of the largest holders of USDY for yield management.",
          "tags": [
            "expansion",
            "RWA"
          ],
          "url": "https://ondo.finance/blog/"
        },
        {
          "date": "2026-01-05",
          "headline": "Ondo announces Ondo Chain, an L1 blockchain purpose-built for tokenized RWAs",
          "summary": "Ondo Chain will provide institutional-grade compliance features including on-chain KYC, controlled transfer permissions, and native RWA oracle infrastructure.",
          "tags": [
            "product",
            "blockchain"
          ],
          "url": "https://ondo.finance/blog/"
        },
        {
          "date": "2025-11-15",
          "headline": "USDY surpasses $700M TVL, ranks among top yield-bearing dollar assets on-chain",
          "summary": "Growing demand for on-chain yield has propelled USDY to become one of the largest RWA-backed stablecoins, accessible to non-US accredited investors.",
          "tags": [
            "growth",
            "yield"
          ],
          "url": "https://ondo.finance/blog/"
        }
      ]
    }
  ]
};

// Computed stats
STABLECOIN_DATA.stats = {
  totalIssuers: STABLECOIN_DATA.issuers.length,
  totalStablecoins: STABLECOIN_DATA.issuers.reduce(
    (sum, i) => sum + i.stablecoins.length,
    0
  ),
  totalMarketCap: STABLECOIN_DATA.issuers.reduce(
    (sum, i) =>
      sum +
      i.stablecoins.reduce((s, sc) => s + (sc.marketCap || 0), 0),
    0
  ),
  uniqueBlockchains: [
    ...new Set(
      STABLECOIN_DATA.issuers.flatMap((i) =>
        i.stablecoins.flatMap((sc) => sc.blockchains)
      )
    ),
  ],
};
