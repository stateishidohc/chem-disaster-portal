/* 出典一覧。本文・物質データ・計算式からは id で参照する。
 * verified:false は書誌を一次資料で確かめきれていないもの（README の「未確認事項」も参照）。 */
window.CD = window.CD || {};
CD.SOURCES = {
  /* ---- 研修資料 ---- */
  lec2026: { t: "令和7年度 産業医科大学 産業医学実践研修「災害時の化学物質等のばく露から労働者を守る」講義資料（2026年2月8日）：上野晋「産業医が知っておくべき化学災害の基礎知識」、中原浩彦「災害時の化学物質ばく露の基本的な考え方」、真鍋憲幸「化学災害時の企業対応の実際」、立石清一郎ほか「化学工場爆発時の産業保健対応（ケーススタディ）」", kind: "研修" },

  /* ---- 緊急時の基準値 ---- */
  epa_aegl: { t: "U.S. EPA. Acute Exposure Guideline Levels (AEGLs) Values.", url: "https://www.epa.gov/aegl/access-acute-exposure-guideline-levels-aegls-values", kind: "公的" },
  nrc_aegl: { t: "National Research Council. Standing Operating Procedures for Developing Acute Exposure Guideline Levels for Hazardous Chemicals. Washington DC: National Academy Press; 2001.", url: "https://doi.org/10.17226/10122", kind: "公的" },
  doe_pac: { t: "U.S. DOE/NNSA. Protective Action Criteria (PAC) with AEGLs, ERPGs, & TEELs ― PAC Database (PacTeel). DOE-HDBK-1046-2016（2022 再確認）.", url: "https://www.energy.gov/nnsa/protective-action-criteria-pac-aegls-erpgs-teels", kind: "公的" },
  aiha_erpg: { t: "AIHA. Emergency Response Planning Guidelines (ERPG) & Workplace Environmental Exposure Levels (WEEL) Handbook.（本アプリの ERPG 値は PubChem に収載された Haz-Map の値。最新版ハンドブックとの照合は未了）", url: "https://www.aiha.org/get-involved/aiha-guideline-foundation/erpgs", kind: "学会", verified: false },
  niosh_idlh: { t: "NIOSH. Immediately Dangerous to Life or Health (IDLH) Values.", url: "https://www.cdc.gov/niosh/idlh/default.html", kind: "公的" },
  niosh_npg: { t: "NIOSH. Pocket Guide to Chemical Hazards.", url: "https://www.cdc.gov/niosh/npg/default.html", kind: "公的" },
  pubchem: { t: "Kim S, et al. PubChem 2025 update. Nucleic Acids Res. 2025;53(D1):D1516–D1525.（PUG-View API から AEGL・PAC・IDLH・ERPG の注釈を取得）", url: "https://pubchem.ncbi.nlm.nih.gov/", kind: "データベース" },
  tenberge1986: { t: "ten Berge WF, Zwart A, Appelman LM. Concentration–time mortality response relationship of irritant and systemically acting vapours and gases. J Hazard Mater. 1986;13(3):301–309.", url: "https://doi.org/10.1016/0304-3894(86)85003-8", kind: "論文" },
  jsoh_oel: { t: "日本産業衛生学会. 許容濃度等の勧告（2025年度）. 産業衛生学雑誌. 2025;67.", url: "https://www.sanei.or.jp/files/topics/oels/oel_2025.pdf", kind: "学会" },
  mhlw_kanri: { t: "厚生労働省. 作業環境評価基準（管理濃度）. 基発1005第3号（平成27年）別添1「測定対象物質と管理濃度等」.", url: "https://www.jaish.gr.jp/horei/hor1-56/hor1-56-48-1-2.html", kind: "公的" },
  mhlw_kijun: { t: "厚生労働省. 化学物質による健康障害防止のための濃度の基準（令和5年告示第177号、令和6年告示第196号ほか）.", url: "https://www.mhlw.go.jp/content/11300000/001252599.pdf", kind: "公的" },
  egov_tokka: { t: "特定化学物質障害予防規則・労働安全衛生法施行令 別表第三（e-Gov 法令検索）.", url: "https://laws.e-gov.go.jp/law/347M50002000039", kind: "公的" },
  ilo_icsc: { t: "ILO/WHO. International Chemical Safety Cards（ACGIH TLV の掲載値。TLV の原本は ACGIH の有料冊子）.", url: "https://chemicalsafety.ilo.org/dyn/icsc/showMainPage.display", kind: "公的" },
  niosh_acn: { t: "NIOSH. Immediately Dangerous to Life or Health (IDLH) Value Profile: Acrylonitrile. DHHS (NIOSH) Publication No. 2016-167.", url: "https://www.cdc.gov/niosh/docs/2016-167/", kind: "公的" },

  /* ---- 物性 ---- */
  nist: { t: "Linstrom PJ, Mallard WG (eds). NIST Chemistry WebBook, NIST Standard Reference Database Number 69.（Antoine 式・沸点）", url: "https://webbook.nist.gov/chemistry/", kind: "公的" },
  props_ref: { t: "液密度・液比熱は化学工学便覧・Perry's Chemical Engineers' Handbook 等の文献値の概数（±10%程度の参考値）。", kind: "参考", verified: false },

  /* ---- 拡散・発生源モデル ---- */
  aloha_tech: { t: "Jones R, Lehr W, Simecek-Beatty D, Reynolds RM. ALOHA (Areal Locations of Hazardous Atmospheres) 5.4.4: Technical Documentation. NOAA Technical Memorandum NOS OR&R 43. Seattle: NOAA; 2013.", url: "https://response.restoration.noaa.gov/sites/default/files/ALOHA_Tech_Doc.pdf", kind: "公的" },
  aloha_um: { t: "U.S. EPA, NOAA. ALOHA User's Manual. 2007.", kind: "公的" },
  aloha_loc: { t: "NOAA Office of Response and Restoration. Toxic Levels of Concern; ALOHA's Limitations.", url: "https://response.restoration.noaa.gov/oil-and-chemical-spills/chemical-spills/resources/toxic-levels-concern.html", kind: "公的" },
  zhang2016: { t: "Zhang Y, Oldenburg CM, Pan L. Fast estimation of dense gas dispersion from multiple continuous CO2 surface leakage sources for risk assessment. Int J Greenh Gas Control. 2016;49:323–329.（Britter & McQuaid 近似式の表を CCPS 1999 から転載）", url: "https://doi.org/10.1016/j.ijggc.2016.03.002", kind: "論文" },
  epa_tscreen: { t: "U.S. EPA. Workbook of Screening Techniques for Assessing Impacts of Toxic Air Pollutants (Revised). EPA-454/R-92-024. 1992.（Britter & McQuaid の判定条件・非等温補正）", url: "https://gaftp.epa.gov/aqmg/SCRAM/models/screening/tscreen/tscrd.pdf", kind: "公的" },
  henry1971: { t: "Henry RE, Fauske HK. The two-phase critical flow of one-component mixtures in nozzles, orifices, and short tubes. J Heat Transfer. 1971;93(2):179–187.", url: "https://doi.org/10.1115/1.3449782", kind: "論文" },
  wilson1987: { t: "Wilson DJ. Stay indoors or evacuate to avoid exposure to toxic gas? Emergency Preparedness Digest. 1987;14(1).", kind: "論文", verified: false },
  beals1971: { t: "Beals GA. Guide to Local Diffusion of Air Pollutants. Technical Report 214. Scott AFB: USAF Air Weather Service; 1971.", kind: "公的" },
  raphael1962: { t: "Raphael JM. Prediction of temperature in rivers and reservoirs. J Power Div Proc ASCE. 1962;88:157–181.", kind: "論文", verified: false },
  hanna2020: { t: "Hanna SR. Air quality model evaluation using Jack Rabbit II chlorine release field data. Atmos Environ. 2020;232:117539.", url: "https://doi.org/10.1016/j.atmosenv.2020.117539", kind: "論文", verified: false },
  baker1983: { t: "Baker WE, Cox PA, Westine PS, Kulesz JJ, Strehlow RA. Explosion Hazards and Evaluation. Amsterdam: Elsevier; 1983.", kind: "教科書" },
  aloha_home: { t: "NOAA Office of Response and Restoration. ALOHA Software.", url: "https://response.restoration.noaa.gov/oil-and-chemical-spills/chemical-spills/response-tools/aloha.html", kind: "公的" },
  pasquill1961: { t: "Pasquill F. The estimation of the dispersion of windborne material. Meteorol Mag. 1961;90:33–49.", kind: "論文" },
  turner1970: { t: "Turner DB. Workbook of Atmospheric Dispersion Estimates. PHS Publication No. 999-AP-26. Cincinnati: U.S. Department of Health, Education, and Welfare; 1970.", kind: "公的" },
  briggs1973: { t: "Briggs GA. Diffusion Estimation for Small Emissions. ATDL Contribution File No. 79. Oak Ridge: Atmospheric Turbulence and Diffusion Laboratory; 1973.", kind: "公的" },
  griffiths1994: { t: "Griffiths RF. Errors in the use of the Briggs parameterization for atmospheric dispersion coefficients. Atmos Environ. 1994;28(17):2861–2865.", url: "https://doi.org/10.1016/1352-2310(94)90086-8", kind: "論文" },
  irwin1979: { t: "Irwin JS. A theoretical variation of the wind profile power-law exponent as a function of surface roughness and stability. Atmos Environ. 1979;13(1):191–194.", url: "https://doi.org/10.1016/0004-6981(79)90260-9", kind: "論文" },
  palazzi1982: { t: "Palazzi E, De Faveri M, Fumarola G, Ferraiolo G. Diffusion from a steady source of short duration. Atmos Environ. 1982;16(12):2785–2790.", url: "https://doi.org/10.1016/0004-6981(82)90029-4", kind: "論文" },
  britter1988: { t: "Britter RE, McQuaid J. Workbook on the Dispersion of Dense Gases. HSE Contract Research Report No. 17/1988. Sheffield: Health and Safety Executive; 1988.", kind: "公的" },
  hanna1993: { t: "Hanna SR, Chang JC, Strimaitis DG. Hazardous gas model evaluation with field observations. Atmos Environ. 1993;27A(15):2265–2285.", url: "https://doi.org/10.1016/0960-1686(93)90397-H", kind: "論文" },
  fauske1988: { t: "Fauske HK, Epstein M. Source term considerations in connection with chemical accidents and vapour cloud modelling. J Loss Prev Process Ind. 1988;1(2):75–83.", url: "https://doi.org/10.1016/0950-4230(88)80016-6", kind: "論文" },
  crowl2011: { t: "Crowl DA, Louvar JF. Chemical Process Safety: Fundamentals with Applications. 3rd ed. Upper Saddle River: Prentice Hall; 2011.", kind: "教科書" },
  ccps1999: { t: "Center for Chemical Process Safety. Guidelines for Consequence Analysis of Chemical Releases. New York: AIChE; 1999.", kind: "教科書" },
  epa_rmp: { t: "U.S. EPA. Risk Management Program Guidance for Offsite Consequence Analysis. EPA 550-B-99-009. 2009.", url: "https://www.epa.gov/rmp/rmp-guidance-offsite-consequence-analysis", kind: "公的" },
  kinney1985: { t: "Kinney GF, Graham KJ. Explosive Shocks in Air. 2nd ed. Berlin: Springer; 1985.", url: "https://doi.org/10.1007/978-3-642-86682-1", kind: "教科書" },
  mhlw_vent: { t: "国土交通省. 建築基準法に基づくシックハウス対策（居室の24時間換気：換気回数 0.5 回/h 以上、2003年施行）.", url: "https://www.mlit.go.jp/jutakukentiku/build/jutakukentiku_house_tk_000043.html", kind: "公的" },

  /* ---- 現場対応 ---- */
  fdma_manual: { t: "総務省消防庁. 化学災害又は生物災害時における消防機関が行う活動マニュアル（令和6年3月改正）.", url: "https://www.fdma.go.jp/singi_kento/kento/post-138.html", kind: "公的" },
  erg2024: { t: "PHMSA / Transport Canada / SCT. 2024 Emergency Response Guidebook (ERG2024).", url: "https://www.phmsa.dot.gov/training/hazmat/erg/emergency-response-guidebook-erg", kind: "公的" },
  usfa_rehab: { t: "U.S. Fire Administration. Emergency Incident Rehabilitation. FA-314. 2008.", url: "https://www.usfa.fema.gov/downloads/pdf/publications/fa_314.pdf", kind: "公的" },
  nfpa1584: { t: "NFPA 1584: Standard on the Rehabilitation Process for Members During Emergency Operations and Training Exercises. 2015 ed.", kind: "基準" },
  niosh_erhms: { t: "NIOSH. Emergency Responder Health Monitoring and Surveillance (ERHMS).", url: "https://www.cdc.gov/niosh/erhms/", kind: "公的" },
  ics208hm: { t: "U.S. Coast Guard / FEMA. ICS 208 HM: Site Safety and Control Plan.", kind: "公的" },
  jpic: { t: "公益財団法人 日本中毒情報センター（中毒110番・医師向け中毒情報）.", url: "https://www.j-poison-ic.jp/", kind: "公的" },
  nihs: { t: "国立医薬品食品衛生研究所 安全情報部. 化学物質の安全性に関する情報（AEGL 情報・国際化学物質安全性カード ICSC 日本語版）.", url: "https://www.nihs.go.jp/hse/chem-info/", kind: "公的" },
  hcrisis: { t: "国立保健医療科学院 H-CRISIS. 一般医療機関における化学テロ対応標準初動マニュアル.", url: "https://h-crisis.niph.go.jp/medact/chemical-2-1/", kind: "公的" },
  chemm: { t: "U.S. HHS/ASPR. CHEMM: Chemical Hazards Emergency Medical Management.", url: "https://chemm.hhs.gov/", kind: "公的" },
  atsdr: { t: "ATSDR. Toxic Substances Portal A–Z Index（Medical Management Guidelines）.", url: "https://wwwn.cdc.gov/TSP/substances/SubstanceAZ.aspx", kind: "公的" },
  nite: { t: "製品評価技術基盤機構（NITE）. NITE 統合版 政府による GHS 分類結果.", url: "https://www.chem-info.nite.go.jp/chem/ghs/ghs_index.html", kind: "公的" },
  echa: { t: "European Chemicals Agency. Registered substances database.", url: "https://echa.europa.eu/information-on-chemicals/registered-substances", kind: "公的" },
  dohc: { t: "産業医科大学 産業生態科学研究所 災害産業保健センター.", url: "https://dohcuoeh.com/", kind: "大学" },
};
