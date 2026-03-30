export type Heir = {
  name: string
  kana: string
  relationship: string
  isLegalHeir: boolean
  birthday: string
  address: string
  domicile: string
  phone: string
  email: string
}

export type PropertyDetail = {
  address: string
  nayoseDestination: string
  evalCertDest: string
  surveySources: string[]
  registryInfo: boolean
  mapInfo: boolean
  landSurvey: boolean
  roadPrice: boolean
}

export type BankAccount = {
  bankName: string
  branchName: string
  cancelFlag: boolean
  safeBox: boolean
  notes: string
}

export type Division = {
  assetCategory: string
  splitMethod: string
  acquirerRatio: string
  confirmedDetail: string
}

export type FormData = {
  // Basic
  orderDate: string
  salesOwner: string
  difficulty: string
  leadSource: string
  lpPartnerName: string
  partnerRep: string
  // Client
  clientName: string
  clientKana: string
  clientPhone: string
  clientMobile: string
  clientEmail: string
  clientZip: string
  clientAddress: string
  clientBirthday: string
  clientGaiji: string
  contactPreference: string[]
  mailingDestination: string
  altMailingAddress: string
  // Deceased
  deceasedName: string
  deceasedKana: string
  deceasedBirthday: string
  dateOfDeath: string
  deceasedAddress: string
  deceasedDomicile: string
  // Heirs
  heirs: Heir[]
  // Order
  procedureType: string[]
  additionalServices: string[]
  importantNotes: string
  // Property
  propertyType: string
  residentStatus: string
  residentName: string
  areaRating: string
  buildingAge: number
  propertySale: string
  saleUrgency: string
  titleDeed: boolean
  taxNotice: boolean
  propertyGeneralNotes: string
  // Property details
  properties: PropertyDetail[]
  // Finance
  bankNames: string
  passbookStatus: string
  cancellationSupport: string
  totalAssetEstimate: string
  taxAdvisorReferral: string
  taxAdvisorName: string
  // Finance details
  bankAccounts: BankAccount[]
  // Division
  clientIntention: string
  distributionPolicy: string
  distributionProposal: string
  agreementSigning: string
  inventoryItems: string[]
  divisions: Division[]
  // Will
  willType: string
  willStorage: string
  willExecution: string
  iryubunRisk: string
  bequest: string
  // Insurance
  insuranceProposal: string
  insuranceCompany: string
  insuranceDetail: string
}

export const INITIAL_DATA: FormData = {
  orderDate: new Date().toISOString().slice(0, 10),
  salesOwner: '',
  difficulty: '',
  leadSource: '',
  lpPartnerName: '',
  partnerRep: '',
  clientName: '',
  clientKana: '',
  clientPhone: '',
  clientMobile: '',
  clientEmail: '',
  clientZip: '',
  clientAddress: '',
  clientBirthday: '',
  clientGaiji: '',
  contactPreference: [],
  mailingDestination: '',
  altMailingAddress: '',
  deceasedName: '',
  deceasedKana: '',
  deceasedBirthday: '',
  dateOfDeath: '',
  deceasedAddress: '',
  deceasedDomicile: '',
  heirs: [],
  procedureType: [],
  additionalServices: [],
  importantNotes: '',
  propertyType: '',
  residentStatus: '',
  residentName: '',
  areaRating: '',
  buildingAge: 0,
  propertySale: '',
  saleUrgency: '',
  titleDeed: false,
  taxNotice: false,
  propertyGeneralNotes: '',
  properties: [],
  bankNames: '',
  passbookStatus: '',
  cancellationSupport: '',
  totalAssetEstimate: '',
  taxAdvisorReferral: '',
  taxAdvisorName: '',
  bankAccounts: [],
  clientIntention: '',
  distributionPolicy: '',
  distributionProposal: '',
  agreementSigning: '',
  inventoryItems: [],
  divisions: [],
  willType: '',
  willStorage: '',
  willExecution: '',
  iryubunRisk: '',
  bequest: '',
  insuranceProposal: '',
  insuranceCompany: '',
  insuranceDetail: '',
}

export const STEPS = [
  { id: 'basic', label: '基本情報', icon: '📋' },
  { id: 'client', label: '依頼者', icon: '👤' },
  { id: 'deceased', label: '被相続人', icon: '📁' },
  { id: 'heirs', label: '相続人', icon: '👨‍👩‍👧' },
  { id: 'order', label: '受注内容', icon: '📝' },
  { id: 'property', label: '不動産', icon: '🏠' },
  { id: 'finance', label: '金融・税', icon: '💴' },
  { id: 'division', label: '分割・遺言', icon: '⚖️' },
  { id: 'confirm', label: '確認', icon: '✅' },
]
