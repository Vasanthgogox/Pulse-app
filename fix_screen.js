const fs = require('fs');
const file = 'features/pod-reconciliation/PodReconciliationScreen.tsx';
let c = fs.readFileSync(file, 'utf8');
c = c.replace("      </View>\n      </View>\n      {isSideBySide && (", "      </View>\n      {isSideBySide && (");
c = c.replace("      )}\n      </View>\n\n      {!isSideBySide && validationModalOpen && (", "      )}\n\n      {!isSideBySide && validationModalOpen && (");
fs.writeFileSync(file, c);
