import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  SafeAreaView, Alert, ActivityIndicator, StatusBar, ScrollView
} from 'react-native'
import { useAuth } from '../AuthContext'
import { BRANCHES } from '../data'

type Step = 'branch' | 'login'

export default function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [step, setStep] = useState<Step>('branch')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, setBranch } = useAuth()

  const handleBranchNext = () => {
    if (!selectedBranch) return
    setBranch(selectedBranch)
    setStep('login')
  }

  const handleLogin = async () => {
    if (!email || !password) return
    setLoading(true)
    const ok = await login(email, password)
    setLoading(false)
    if (ok) {
      onLogin()
    } else {
      Alert.alert('Login failed', 'Invalid email or password')
    }
  }

  const branchLabel = BRANCHES.find(b => b.id === selectedBranch)?.name || ''

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={s.logoWrap}>
          <View style={s.logoRow}>
            <Text style={s.logoNear}>near</Text>
            <Text style={s.logoBi}>bi</Text>
          </View>
          <Text style={s.tagline}>you will get it here</Text>
          <View style={s.badge}>
            <Text style={s.badgeText}>STAFF PORTAL</Text>
          </View>
        </View>

        {/* Card */}
        <View style={s.card}>
          {step === 'branch' ? (
            <>
              <Text style={s.cardTitle}>Select branch</Text>
              <Text style={s.cardSub}>Choose your store to continue</Text>
              {BRANCHES.map(b => (
                <TouchableOpacity
                  key={b.id}
                  style={[s.branchBtn, selectedBranch === b.id && s.branchBtnActive]}
                  onPress={() => setSelectedBranch(b.id)}
                  activeOpacity={0.8}
                >
                  <View style={[s.branchIcon, selectedBranch === b.id && s.branchIconActive]}>
                    <Text style={{ fontSize: 20 }}>🏪</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.branchName}>{b.name}</Text>
                    <Text style={s.branchSub}>Tap to select</Text>
                  </View>
                  {selectedBranch === b.id && <Text style={s.check}>✓</Text>}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[s.cta, !selectedBranch && s.ctaDisabled]}
                onPress={handleBranchNext}
                disabled={!selectedBranch}
                activeOpacity={0.85}
              >
                <Text style={[s.ctaText, !selectedBranch && s.ctaTextDisabled]}>Continue →</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={s.backBtn} onPress={() => setStep('branch')}>
                <Text style={s.backText}>← Back</Text>
              </TouchableOpacity>
              <View style={s.branchChip}>
                <Text style={s.branchChipText}>{branchLabel}</Text>
              </View>
              <Text style={[s.cardTitle, { marginTop: 12 }]}>Sign in</Text>
              <Text style={s.cardSub}>Admin access only</Text>

              <View style={s.fieldWrap}>
                <Text style={s.fieldLabel}>Email</Text>
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="adminnearbi@gmail.com"
                  placeholderTextColor="#BDBDBD"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={s.fieldWrap}>
                <Text style={s.fieldLabel}>Password</Text>
                <TextInput
                  style={s.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#BDBDBD"
                  secureTextEntry
                  onSubmitEditing={handleLogin}
                />
              </View>

              <TouchableOpacity
                style={[s.cta, loading && { opacity: 0.7 }]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#111" />
                  : <Text style={s.ctaText}>Sign in</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </View>

        <Text style={s.version}>Nearbi Staff Management v1.0</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAFAFA' },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 40 },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  logoNear: { fontSize: 44, fontWeight: '900', color: '#111111', letterSpacing: -2 },
  logoBi: { fontSize: 44, fontWeight: '900', color: '#F5A800', letterSpacing: -2 },
  tagline: { fontSize: 13, color: '#757575', marginTop: 2, letterSpacing: 0.5 },
  badge: { marginTop: 10, backgroundColor: '#F5A800', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#111', letterSpacing: 1 },
  card: { backgroundColor: '#FFFFFF', borderColor: '#E0E0E0', borderWidth: 1, borderRadius: 18, padding: 28, width: '100%', maxWidth: 400, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 4 },
  cardSub: { fontSize: 13, color: '#757575', marginBottom: 20 },
  branchBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: '#E0E0E0', borderRadius: 12, padding: 14, marginBottom: 10, backgroundColor: '#FAFAFA' },
  branchBtnActive: { borderColor: '#F5A800', backgroundColor: '#FFF8E7' },
  branchIcon: { width: 40, height: 40, backgroundColor: '#F0F0F0', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  branchIconActive: { backgroundColor: '#F5A800' },
  branchName: { fontWeight: '700', fontSize: 15, color: '#111' },
  branchSub: { fontSize: 12, color: '#757575', marginTop: 2 },
  check: { color: '#F5A800', fontSize: 22, fontWeight: '900' },
  cta: { backgroundColor: '#F5A800', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  ctaDisabled: { backgroundColor: '#E0E0E0' },
  ctaText: { fontWeight: '700', fontSize: 15, color: '#111' },
  ctaTextDisabled: { color: '#999' },
  backBtn: { marginBottom: 12 },
  backText: { color: '#757575', fontSize: 13 },
  branchChip: { backgroundColor: '#FFF8E7', borderWidth: 1, borderColor: '#F5A800', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 2, alignSelf: 'flex-start' },
  branchChipText: { fontSize: 11, color: '#D48F00', fontWeight: '600' },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#444', marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 10, padding: 12, fontSize: 14, color: '#111', backgroundColor: '#FFF' },
  version: { marginTop: 24, fontSize: 12, color: '#BDBDBD' },
})
