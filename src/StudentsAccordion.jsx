import React, { useState } from 'react';
import { PencilSquareIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

// ЦЕ МОК-ДАНІ. ТОБІ ПОТРІБНО ЗАМІНИТИ ЇХ НА ДАНІ ЗІ СВОЄЇ БАЗИ.
const groupsData = [
  {
    name: "Latina Solo",
    studentsCount: 27,
    students: [
      { id: 1, name: "Евеліна Заїка", phone: "+380977618579", instagram: "@evalynere", lesson: "Latina 19:10", subscription: "2/12" },
      { id: 2, name: "Ілона Іваницька", phone: "", instagram: "", lesson: "Latina 19:10", subscription: "1/8" },
      { id: 3, name: "Іра Влащук", phone: "+380986761234", instagram: "@iblshchyk_irina", lesson: "Latina 19:10", subscription: "2/12" },
      { id: 4, name: "Ірина Агронська", phone: "", instagram: "", lesson: "Latina 19:10", subscription: "" },
      { id: 5, name: "Катя Банашко", phone: "", instagram: "", lesson: "Latina 19:10", subscription: "4/8" },
      // Додай ще учнів...
    ]
  },
  {
    name: "Bachata Ladies",
    studentsCount: 15,
    students: [
      { id: 6, name: "Олена Петренко", phone: "+380501234567", instagram: "@olenka_p", lesson: "Bachata 18:00", subscription: "5/12" },
      { id: 7, name: "Татьяна Ковальчук", phone: "", instagram: "@tanya_k", lesson: "Bachata 18:00", subscription: "8/8" },
      // Додай ще учнів...
    ]
  },
  // Додай інші класи...
];

function StudentsAccordion() {
  // Стан для відстеження, яка група розгорнута
  const [expandedGroups, setExpandedGroups] = useState({});

  // Функція для розгортання/згортання групи
  const toggleGroup = (groupName) => {
    setExpandedGroups(prevState => ({
      ...prevState,
      [groupName]: !prevState[groupName]
    }));
  };

  return (
    <div className="bg-gray-950 text-white min-h-screen p-4">
      {/* Верхня панель */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-red-100 flex items-center">
          <span className="text-red-500 mr-2">🪩</span> Dance Studio
        </h1>
        <div className="flex gap-2">
          <button className="bg-red-900 text-red-100 px-4 py-1.5 rounded-lg text-sm font-semibold">+ Учениця</button>
          <button className="bg-purple-900 text-purple-100 px-4 py-1.5 rounded-lg text-sm font-semibold">+ Абонемент</button>
          <button className="bg-gray-800 text-gray-300 px-4 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5">
            <span className="text-green-500 text-xs">●</span> Відмітка
          </button>
        }
      </div>

      {/* Навігація */}
      <div className="flex gap-1.5 bg-gray-900 p-1.5 rounded-xl mb-6 text-sm text-gray-400 font-medium overflow-x-auto">
        <button className="px-4 py-2 rounded-lg hover:bg-gray-800">Дашборд</button>
        <button className="px-4 py-2 rounded-lg bg-gray-800 text-white flex items-center gap-1.5">
          <span className="text-green-500 text-xs">●</span> Учениці
        </button>
        <button className="px-4 py-2 rounded-lg hover:bg-gray-800">Абонементи</button>
        <button className="px-4 py-2 rounded-lg hover:bg-gray-800">Відвідування</button>
        <button className="px-4 py-2 rounded-lg hover:bg-gray-800">Графік</button>
        <button className="px-4 py-2 rounded-lg hover:bg-gray-800">Сповіщення</button>
        <button className="px-4 py-2 rounded-lg hover:bg-gray-800">Фінанси</button>
      </div>

      {/* Пошук */}
      <input 
        type="search" 
        placeholder="Пошук..." 
        className="w-full bg-gray-900 text-gray-300 p-3 rounded-xl mb-6 border border-gray-800 focus:border-red-500 focus:ring-red-500 outline-none"
      />

      {/* Спадне меню (Акордеон) */}
      <div className="space-y-3">
        {groupsData.map(group => (
          <div key={group.name} className="border border-gray-800 rounded-xl overflow-hidden">
            {/* Заголовок групи */}
            <button 
              onClick={() => toggleGroup(group.name)} 
              className="w-full flex justify-between items-center p-4 bg-gray-900 hover:bg-gray-800/70 text-left focus:outline-none"
            >
              <h2 className="text-lg font-bold text-red-500 flex items-center gap-2">
                {group.name} 
                <span className="text-sm font-normal text-gray-500">({group.studentsCount})</span>
              </h2>
              {expandedGroups[group.name] ? (
                <ChevronUpIcon className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDownIcon className="w-5 h-5 text-gray-500" />
              )}
            </button>

            {/* Список учнів (розгортається) */}
            {expandedGroups[group.name] && (
              <div className="p-4 bg-gray-950 space-y-2 border-t border-gray-800">
                {group.students.map(student => (
                  <div key={student.id} className="bg-gray-900 p-4 rounded-xl flex justify-between items-start gap-4 hover:bg-gray-800/40">
                    <div className="flex-1 space-y-0.5">
                      <p className="font-semibold text-gray-100">{student.name}</p>
                      {student.phone && <p className="text-xs text-gray-500">{student.phone}</p>}
                      {student.instagram && <p className="text-xs text-gray-500">{student.instagram}</p>}
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right flex items-center gap-1.5">
                        <span className="bg-red-950 text-red-300 text-xs px-2 py-0.5 rounded-md font-mono">{student.lesson}</span>
                        {student.subscription && <span className="text-xs text-red-300 font-mono">({student.subscription})</span>}
                      </div>

                      <div className="flex gap-1">
                        <button className="p-1.5 text-gray-600 hover:text-white rounded-md">
                          <PencilSquareIcon className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 text-gray-600 hover:text-white rounded-md">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {group.students.length === 0 && (
                  <p className="text-center text-gray-600 p-4">У цьому класі поки немає учениць.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default StudentsAccordion;
