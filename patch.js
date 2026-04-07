const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'features/pod-reconciliation/components/PodValidationView.tsx');
let content = fs.readFileSync(file, 'utf8');

const imports = `import { runOCR } from '@/lib/pod/ocr';
import { chatWithDocument } from '@/lib/pod/chat';
import { compressImage } from '@/lib/pod/imageCompression';`;

content = content.replace("import type { PodReconciliationTripView", `${imports}\nimport type { PodReconciliationTripView`);

// State additions
const stateAddition = `
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'audit' | 'chat'>('audit');
`;

content = content.replace("const [isSubmitting, setIsSubmitting] = useState(false);", `const [isSubmitting, setIsSubmitting] = useState(false);\n${stateAddition}`);

// Add functions
const functionsAddition = `
  const handleScanWithAI = async (docPath: string, fileName: string) => {
    try {
      setIsScanning(true);
      setScanProgress(5);
      
      const url = getFileUrl(docPath);
      const response = await fetch(url);
      const blob = await response.blob();
      
      setScanProgress(15);
      const finalFile = await compressImage(blob, 1200);
      
      setScanProgress(30);
      const result = await runOCR(finalFile, fileName, setScanProgress);
      
      if (result.extraction.financials) {
        if (result.extraction.financials.shortage_amount?.value) {
          setShortage(String(result.extraction.financials.shortage_amount.value));
        }
        if (result.extraction.financials.damage_amount?.value) {
          setDamage(String(result.extraction.financials.damage_amount.value));
        }
      }
      Alert.alert('AI Scan Complete', \`Extracted data in \${result.processingTime.toFixed(1)}s\`);
    } catch (err) {
      console.error(err);
      Alert.alert('Scan Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsScanning(false);
      setScanProgress(0);
    }
  };

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || attachments.length === 0) return;
    
    const userMessage = chatInput.trim();
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const doc = attachments[0]; // chat with the first attachment for now
      const url = getFileUrl(doc.file_path);
      const response = await fetch(url);
      const blob = await response.blob();
      const finalFile = await compressImage(blob, 1200);

      const reply = await chatWithDocument(finalFile, doc.file_name, userMessage);
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that request." }]);
    } finally {
      setIsChatLoading(false);
    }
  };
`;

content = content.replace("const handleValidate = async () => {", `${functionsAddition}\n  const handleValidate = async () => {`);

// Modify content view to add tabs
const tabsAddition = `
      <View style={styles.tabContainer}>
        <Pressable style={[styles.tab, activeTab === 'audit' && styles.tabActive]} onPress={() => setActiveTab('audit')}>
          <Text style={[styles.tabText, activeTab === 'audit' && styles.tabTextActive]}>Audit</Text>
        </Pressable>
        <Pressable style={[styles.tab, activeTab === 'chat' && styles.tabActive]} onPress={() => setActiveTab('chat')}>
          <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>AI Chat</Text>
        </Pressable>
      </View>
`;

content = content.replace("<ScrollView style={styles.content} showsVerticalScrollIndicator={false}>", `<ScrollView style={styles.content} showsVerticalScrollIndicator={false}>\n${tabsAddition}`);

// Add AI Chat section and toggle visibility of audit fields
content = content.replace("        <View style={styles.section}>\n          <Text style={styles.sectionLabel}>Trip Details</Text>", `        {activeTab === 'audit' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Trip Details</Text>`);

content = content.replace(`                  {att.file_type && att.file_type.startsWith('image/') ? (
                    <Image 
                      source={{ uri: getFileUrl(att.file_path) }} 
                      style={{ width: '100%', height: 100, borderRadius: 8 }} 
                      resizeMode="cover"
                    />
                  ) : (
                    <FontAwesome name="file-pdf-o" size={40} color={Theme.primary} />
                  )}
                  <Text style={styles.attachmentName} numberOfLines={1}>{att.file_name}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>`, `                  {att.file_type && att.file_type.startsWith('image/') ? (
                    <Image 
                      source={{ uri: getFileUrl(att.file_path) }} 
                      style={{ width: '100%', height: 100, borderRadius: 8 }} 
                      resizeMode="cover"
                    />
                  ) : (
                    <FontAwesome name="file-pdf-o" size={40} color={Theme.primary} />
                  )}
                  <Text style={styles.attachmentName} numberOfLines={1}>{att.file_name}</Text>
                  
                  <Pressable 
                    style={styles.scanBtn} 
                    onPress={() => handleScanWithAI(att.file_path, att.file_name)}
                    disabled={isScanning}
                  >
                    {isScanning ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <FontAwesome name="magic" size={12} color="#fff" />
                        <Text style={styles.scanBtnText}>Scan</Text>
                      </>
                    )}
                  </Pressable>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        </>
      )}

      {activeTab === 'chat' && (
        <View style={styles.chatSection}>
          <ScrollView style={styles.chatHistory}>
            {chatMessages.length === 0 && (
              <Text style={styles.emptyText}>Ask questions about the attached PODs (e.g. "Why is there a delay penalty?").</Text>
            )}
            {chatMessages.map((m, i) => (
              <View key={i} style={[styles.chatBubble, m.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssistant]}>
                <Text style={styles.chatText}>{m.content}</Text>
              </View>
            ))}
            {isChatLoading && (
              <View style={[styles.chatBubble, styles.chatBubbleAssistant]}>
                <ActivityIndicator size="small" color={Theme.primary} />
              </View>
            )}
          </ScrollView>
          <View style={styles.chatInputWrapper}>
            <TextInput
              style={styles.chatInput}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Ask AI..."
              placeholderTextColor={Theme.textMuted}
            />
            <Pressable style={styles.chatSendBtn} onPress={handleChatSubmit} disabled={isChatLoading || !chatInput.trim()}>
              <FontAwesome name="send" size={16} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}`);

// Add new styles
const newStyles = `
  tabContainer: { flexDirection: 'row', gap: 12, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: Theme.borderLight },
  tab: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Theme.primary },
  tabText: { fontSize: 13, fontWeight: '700', color: Theme.textMuted, textTransform: 'uppercase' },
  tabTextActive: { color: Theme.primary },
  scanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Theme.textPrimaryDark, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, width: '100%', marginTop: 8 },
  scanBtnText: { color: '#fff', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  chatSection: { flex: 1, minHeight: 300, paddingBottom: 24 },
  chatHistory: { flex: 1, marginBottom: 16 },
  chatBubble: { padding: 12, borderRadius: 12, maxWidth: '85%', marginBottom: 12 },
  chatBubbleUser: { backgroundColor: Theme.primary, alignSelf: 'flex-end', borderBottomRightRadius: 2 },
  chatBubbleAssistant: { backgroundColor: Theme.cardWhite, alignSelf: 'flex-start', borderBottomLeftRadius: 2, borderWidth: 1, borderColor: Theme.borderLight },
  chatText: { fontSize: 13, color: '#fff', fontWeight: '500' },
  chatInputWrapper: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chatInput: { flex: 1, backgroundColor: Theme.cardWhite, borderWidth: 1, borderColor: Theme.borderInput, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14 },
  chatSendBtn: { backgroundColor: Theme.primary, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
`;

content = content.replace("tabletContainer: { flex: 1, backgroundColor: Theme.screenBackground },", `tabletContainer: { flex: 1, backgroundColor: Theme.screenBackground },${newStyles}`);

// We need to fix chatText color. It's white for user, but should be dark for assistant.
content = content.replace("chatText: { fontSize: 13, color: '#fff', fontWeight: '500' },", "chatText: { fontSize: 13, color: '#fff', fontWeight: '500' },\n  chatTextAssistant: { fontSize: 13, color: Theme.textPrimaryDark, fontWeight: '500' },");
content = content.replace("<Text style={styles.chatText}>{m.content}</Text>", "<Text style={m.role === 'user' ? styles.chatText : styles.chatTextAssistant}>{m.content}</Text>");

fs.writeFileSync(file, content);
